from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.permissions import IsAdminRole

from .models import ClientProfile, Notification, User, WriterProfile
from .serializers import (
    ChangePasswordSerializer,
    ClientProfileSerializer,
    KycSubmitSerializer,
    MeSerializer,
    NotificationSerializer,
    PublicWriterSerializer,
    RegisterSerializer,
    RoleTokenObtainPairSerializer,
    WriterProfileSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        refresh["username"] = user.username
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": MeSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer
    permission_classes = [AllowAny]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            from .serializers import UserSerializer

            return UserSerializer
        return MeSerializer


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password updated."})


class KycSubmitView(generics.UpdateAPIView):
    serializer_class = KycSubmitSerializer

    def get_object(self):
        return self.request.user


class WriterProfileView(generics.RetrieveUpdateAPIView):
    """The logged-in writer's own editable profile."""

    serializer_class = WriterProfileSerializer

    def get_object(self):
        profile, _ = WriterProfile.objects.get_or_create(user=self.request.user)
        return profile


class ClientProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ClientProfileSerializer

    def get_object(self):
        profile, _ = ClientProfile.objects.get_or_create(user=self.request.user)
        return profile


class PublicWriterViewSet(viewsets.ReadOnlyModelViewSet):
    """Browsable writer directory for clients."""

    serializer_class = PublicWriterSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["tier"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "headline", "bio"]
    ordering_fields = ["rating_avg", "completed_orders", "on_time_rate", "created_at"]
    ordering = ["-rating_avg", "-completed_orders"]
    lookup_field = "user__username"
    lookup_url_kwarg = "username"

    def get_queryset(self):
        qs = WriterProfile.objects.select_related("user").filter(is_suspended=False)
        subject = self.request.query_params.get("subject")
        if subject:
            qs = qs.filter(subjects__icontains=subject)
        min_rating = self.request.query_params.get("min_rating")
        if min_rating:
            qs = qs.filter(rating_avg__gte=min_rating)
        return qs


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return self.request.user.notifications.all()

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.mark_read()
        return Response({"detail": "Marked read."})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        from django.utils import timezone

        count = request.user.notifications.filter(is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"updated": count})


class AdminUserViewSet(viewsets.ModelViewSet):
    """User administration: verification, KYC approval, suspension."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = MeSerializer
    queryset = User.objects.select_related("writer_profile", "client_profile", "wallet").all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["role", "kyc_status", "is_verified", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name", "phone"]

    @action(detail=True, methods=["post"], url_path="approve-kyc")
    def approve_kyc(self, request, pk=None):
        user = self.get_object()
        user.kyc_status = "approved"
        user.is_verified = True
        user.save(update_fields=["kyc_status", "is_verified"])
        from .models import notify

        notify(
            user,
            "KYC approved",
            "Your identity has been verified. You can now withdraw earnings.",
            Notification.Kind.SYSTEM,
        )
        return Response({"detail": "KYC approved."})

    @action(detail=True, methods=["post"], url_path="reject-kyc")
    def reject_kyc(self, request, pk=None):
        user = self.get_object()
        user.kyc_status = "rejected"
        user.save(update_fields=["kyc_status"])
        return Response({"detail": "KYC rejected."})

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        user = self.get_object()
        reason = request.data.get("reason", "Administrative action")
        profile = getattr(user, "writer_profile", None)
        if profile:
            profile.is_suspended = True
            profile.suspended_reason = reason
            profile.save(update_fields=["is_suspended", "suspended_reason", "updated_at"])
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({"detail": "User suspended."})

    @action(detail=True, methods=["post"])
    def reinstate(self, request, pk=None):
        user = self.get_object()
        profile = getattr(user, "writer_profile", None)
        if profile:
            profile.is_suspended = False
            profile.suspended_reason = ""
            profile.save(update_fields=["is_suspended", "suspended_reason", "updated_at"])
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response({"detail": "User reinstated."})


class AdminStatsView(APIView):
    """Headline numbers for the admin dashboard."""

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from django.db.models import Count, Sum

        from apps.checks.models import CheckRequest
        from apps.messaging.models import ContactLeakFlag
        from apps.orders.models import Deliverable, Dispute, Order
        from apps.payments.models import EscrowTransaction

        escrow_held = (
            EscrowTransaction.objects.filter(status="held").aggregate(t=Sum("amount_held"))["t"] or 0
        )
        platform_revenue = (
            EscrowTransaction.objects.filter(status__in=["released", "partial_release"]).aggregate(
                t=Sum("platform_fee")
            )["t"]
            or 0
        )
        return Response(
            {
                "users": User.objects.count(),
                "writers": User.objects.filter(role="writer").count(),
                "clients": User.objects.filter(role="client").count(),
                "orders_total": Order.objects.count(),
                "orders_active": Order.objects.filter(
                    status__in=["escrowed", "in_progress", "submitted", "in_revision"]
                ).count(),
                "open_disputes": Dispute.objects.filter(status__in=["open", "under_review"]).count(),
                "flagged_deliverables": Deliverable.objects.filter(flagged=True).count(),
                "pending_kyc": User.objects.filter(kyc_status="pending").count(),
                "pending_check_requests": CheckRequest.objects.filter(status="pending").count(),
                "open_contact_leaks": ContactLeakFlag.objects.filter(reviewed=False).count(),
                "escrow_held": str(escrow_held),
                "platform_revenue": str(platform_revenue),
                "orders_by_status": list(
                    Order.objects.values("status").annotate(count=Count("id")).order_by("-count")
                ),
            }
        )
