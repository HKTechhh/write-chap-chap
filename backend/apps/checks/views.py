from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Notification, notify
from apps.common.permissions import IsAdminRole

from .models import CheckReport, CheckRequest
from .serializers import (
    CheckPricingSerializer,
    CheckReportSerializer,
    CheckRequestCreateSerializer,
    CheckRequestSerializer,
)


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

        from apps.accounts.models import User

        for admin in User.objects.filter(is_staff=True)[:10]:
            notify(
                admin,
                "New document check request",
                f"{instance.requester_display} requested "
                f"{len(instance.report_types)} report(s) — {instance.reference}.",
                Notification.Kind.SYSTEM,
                link="/admin/checks",
            )

        return Response(
            CheckRequestSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["get"], url_path="track/(?P<reference>[^/.]+)")
    def track(self, request, reference=None):
        instance = CheckRequest.objects.filter(reference__iexact=reference).first()
        if not instance:
            return Response(
                {"detail": "No request found with that reference."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(CheckRequestSerializer(instance).data)

    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
        qs = CheckRequest.objects.filter(requested_by=request.user).prefetch_related("reports")
        return Response(CheckRequestSerializer(qs, many=True).data)


class AdminCheckRequestViewSet(viewsets.ModelViewSet):
    """The admin-side queue: process, upload reports, deliver."""

    permission_classes = [IsAdminRole]
    serializer_class = CheckRequestSerializer
    queryset = CheckRequest.objects.select_related("requested_by").prefetch_related("reports")
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "payment_status"]

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        instance = self.get_object()
        instance.payment_status = CheckRequest.PaymentStatus.PAID
        instance.save(update_fields=["payment_status", "updated_at"])
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
        if not report_type:
            return Response(
                {"detail": "report_type is required."}, status=status.HTTP_400_BAD_REQUEST
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
        instance.status = CheckRequest.Status.PROCESSED
        instance.save(update_fields=["status", "updated_at"])
        return Response(CheckReportSerializer(report).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def deliver(self, request, pk=None):
        instance = self.get_object()
        if not instance.reports.exists():
            return Response(
                {"detail": "Upload at least one report before delivering."},
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
