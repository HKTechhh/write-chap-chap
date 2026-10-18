import logging

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Notification, notify
from apps.payments.gateways import GatewayError
from apps.common.permissions import IsAdminRole

from .payment import normalise_phone, start_payment
from .models import BUNDLE_REPORT_TYPES, CheckReport, CheckRequest
from .serializers import (
    CheckPricingSerializer,
    CheckReportSerializer,
    CheckRequestCreateSerializer,
    CheckRequestPublicSerializer,
    CheckRequestSerializer,
)


logger = logging.getLogger(__name__)


class CheckPricingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(CheckPricingSerializer.payload())


class CheckRequestViewSet(viewsets.GenericViewSet):
    """Public submission + "track my request" lookup.

    Deliberately no list endpoint for non-admins: this queue belongs to the
    admin dashboard only.
    """

    permission_classes = [AllowAny]
    serializer_class = CheckRequestCreateSerializer

    def get_queryset(self):
        return CheckRequest.objects.prefetch_related("reports")

    def create(self, request):
        serializer = CheckRequestCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Prompt the client's phone for the KES 120 payment. The request stays hidden from
        # the admin queue until Safaricom confirms it; if the prompt can't be sent the
        # client can retry from the tracking panel.
        try:
            start_payment(instance, serializer.validated_data["contact_phone"])
        except GatewayError as exc:
            logger.warning("Document check %s: STK push failed: %s", instance.reference, exc)

        instance.refresh_from_db()
        return Response(
            CheckRequestPublicSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="pay/(?P<reference>[^/.]+)")
    def pay(self, request, reference=None):
        """Send the M-Pesa prompt again (wrong PIN, timeout, cancelled prompt)."""
        instance = CheckRequest.objects.filter(reference__iexact=reference).first()
        if not instance:
            return Response({"detail": "No request found with that reference."}, status=404)
        if instance.payment_status != CheckRequest.PaymentStatus.UNPAID:
            return Response({"detail": "This request is already paid."}, status=400)
        phone = normalise_phone(request.data.get("phone") or instance.contact_phone)
        if not phone:
            return Response({"detail": "Enter a valid Safaricom number, e.g. 0712345678."}, status=400)
        try:
            start_payment(instance, phone)
        except GatewayError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        instance.refresh_from_db()
        return Response(CheckRequestPublicSerializer(instance).data)

    @action(detail=False, methods=["get"], url_path="track/(?P<reference>[^/.]+)")
    def track(self, request, reference=None):
        instance = CheckRequest.objects.filter(reference__iexact=reference).first()
        if not instance:
            return Response(
                {"detail": "No request found with that reference."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(CheckRequestPublicSerializer(instance).data)

    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
        qs = CheckRequest.objects.filter(requested_by=request.user).prefetch_related("reports")
        return Response(CheckRequestPublicSerializer(qs, many=True).data)


class AdminCheckRequestViewSet(viewsets.ModelViewSet):
    """The admin-side queue: process, upload reports, deliver."""

    permission_classes = [IsAdminRole]
    serializer_class = CheckRequestSerializer
    queryset = CheckRequest.objects.select_related("requested_by").prefetch_related("reports")
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "payment_status"]

    def get_queryset(self):
        qs = super().get_queryset()
        # Unpaid submissions are not work yet; show them only when asked for explicitly.
        if self.action == "list" and not self.request.query_params.get("status"):
            qs = qs.exclude(status=CheckRequest.Status.AWAITING_PAYMENT)
        return qs

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        instance = self.get_object()
        instance.payment_status = CheckRequest.PaymentStatus.PAID
        if instance.status == CheckRequest.Status.AWAITING_PAYMENT:
            instance.status = CheckRequest.Status.PENDING
        instance.save(update_fields=["payment_status", "status", "updated_at"])
        return Response(CheckRequestSerializer(instance).data)

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        instance = self.get_object()
        instance.status = CheckRequest.Status.PROCESSING
        instance.save(update_fields=["status", "updated_at"])
        return Response(CheckRequestSerializer(instance).data)

    @action(detail=True, methods=["post"], url_path="reports")
    def upload_report(self, request, pk=None):
        instance = self.get_object()
        report_type = request.data.get("report_type")
        if report_type not in BUNDLE_REPORT_TYPES:
            return Response(
                {"detail": f"report_type must be one of: {', '.join(BUNDLE_REPORT_TYPES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report, _ = CheckReport.objects.update_or_create(
            check_request=instance,
            report_type=report_type,
            defaults={
                "file": request.FILES.get("file") or None,
                "report_url": request.data.get("report_url", ""),
                "score": request.data.get("score") or None,
                "summary": request.data.get("summary", ""),
                "processed_by": request.user,
            },
        )
        uploaded = set(instance.reports.values_list("report_type", flat=True))
        if uploaded >= set(BUNDLE_REPORT_TYPES):
            instance.status = CheckRequest.Status.PROCESSED
            instance.save(update_fields=["status", "updated_at"])
        return Response(CheckReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def deliver(self, request, pk=None):
        instance = self.get_object()
        uploaded = set(instance.reports.values_list("report_type", flat=True))
        missing = [t for t in BUNDLE_REPORT_TYPES if t not in uploaded]
        if missing:
            return Response(
                {"detail": f"Upload both reports before delivering. Missing: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        instance.reports.filter(delivered_at__isnull=True).update(delivered_at=now)
        instance.status = CheckRequest.Status.DELIVERED
        instance.delivered_at = now
        instance.save(update_fields=["status", "delivered_at", "updated_at"])

        if instance.requested_by:
            notify(
                instance.requested_by,
                "Your document check is ready",
                f"Report(s) for {instance.reference} are available to download.",
                Notification.Kind.SYSTEM,
                link=f"/check-my-paper?ref={instance.reference}",
            )
        return Response(CheckRequestSerializer(instance).data)
