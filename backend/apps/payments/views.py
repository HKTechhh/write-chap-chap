import logging
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Notification, notify
from apps.common.permissions import IsAdminRole

from .gateways import GatewayError, flutterwave, mpesa
from .models import (
    InsufficientFunds,
    PaymentIntent,
    Subscription,
    Wallet,
    WalletTransaction,
    WithdrawalRequest,
)
from .serializers import (
    PaymentIntentSerializer,
    SubscriptionSerializer,
    TopUpSerializer,
    WalletSerializer,
    WalletTransactionSerializer,
    WithdrawalSerializer,
)

logger = logging.getLogger(__name__)


class WalletView(APIView):
    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        return Response(WalletSerializer(wallet).data)


class WalletTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WalletTransactionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["type", "direction"]

    def get_queryset(self):
        wallet, _ = Wallet.objects.get_or_create(user=self.request.user)
        return wallet.transactions.select_related("order")


class TopUpView(APIView):
    """Start a wallet top-up. Falls back to simulation when keys are absent."""

    def post(self, request):
        serializer = TopUpSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data["amount"]
        provider = serializer.validated_data["provider"]

        intent = PaymentIntent.objects.create(
            user=request.user,
            provider=provider,
            amount=amount,
            phone=serializer.validated_data.get("phone", ""),
        )

        try:
            if provider == PaymentIntent.Provider.MPESA:
                result = mpesa.stk_push(
                    phone=intent.phone,
                    amount=amount,
                    reference=str(intent.reference)[:12],
                    description="Wallet top-up",
                )
                intent.provider_reference = result.get("CheckoutRequestID", "")
            else:
                result = flutterwave.create_payment_link(
                    email=request.user.email,
                    amount=amount,
                    reference=str(intent.reference),
                    name=request.user.display_name,
                )
        except GatewayError as exc:
            intent.status = PaymentIntent.Status.FAILED
            intent.failure_reason = str(exc)[:255]
            intent.save(update_fields=["status", "failure_reason", "updated_at"])
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        intent.raw_response = result
        intent.save(update_fields=["provider_reference", "raw_response", "updated_at"])

        # In simulation mode the money lands immediately so the full order
        # lifecycle stays testable without live credentials.
        if result.get("simulated"):
            _settle_intent(intent)
            return Response(
                {
                    "simulated": True,
                    "detail": f"Simulated top-up of KES {amount} credited to your wallet. "
                    "Configure M-Pesa/Flutterwave keys to take real payments.",
                    "intent": PaymentIntentSerializer(intent).data,
                    "wallet": WalletSerializer(request.user.wallet).data,
                }
            )

        return Response(
            {
                "simulated": False,
                "detail": "Check your phone to authorise the payment."
                if provider == PaymentIntent.Provider.MPESA
                else "Continue to the payment page.",
                "payment_link": result.get("link"),
                "intent": PaymentIntentSerializer(intent).data,
            }
        )


@transaction.atomic
def _settle_intent(intent):
    """Credit a successful payment intent to the user's wallet exactly once."""
    intent = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if intent.status == PaymentIntent.Status.SUCCESS:
        return intent
    wallet, _ = Wallet.objects.get_or_create(user=intent.user)
    wallet.credit(
        intent.amount,
        WalletTransaction.Type.TOPUP,
        reference=str(intent.reference),
        description=f"Top-up via {intent.get_provider_display()}",
    )
    intent.status = PaymentIntent.Status.SUCCESS
    intent.save(update_fields=["status", "updated_at"])
    notify(
        intent.user,
        "Wallet topped up",
        f"KES {intent.amount} added to your wallet.",
        Notification.Kind.PAYMENT,
        link="/wallet",
    )
    return intent


class MpesaCallbackView(APIView):
    """Daraja STK callback. Public by necessity — validated by CheckoutRequestID."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        body = (request.data or {}).get("Body", {}).get("stkCallback", {})
        checkout_id = body.get("CheckoutRequestID")
        result_code = body.get("ResultCode")

        intent = PaymentIntent.objects.filter(provider_reference=checkout_id).first()
        if not intent:
            logger.warning("M-Pesa callback for unknown CheckoutRequestID %s", checkout_id)
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        intent.raw_response = request.data
        if result_code == 0:
            _settle_intent(intent)
        else:
            intent.status = PaymentIntent.Status.FAILED
            intent.failure_reason = str(body.get("ResultDesc", ""))[:255]
            intent.save(update_fields=["status", "failure_reason", "raw_response", "updated_at"])

        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


class FlutterwaveCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        data = request.data or {}
        tx_ref = data.get("txRef") or data.get("tx_ref") or (data.get("data") or {}).get("tx_ref")
        intent = PaymentIntent.objects.filter(reference=tx_ref).first()
        if not intent:
            return Response({"status": "ignored"})

        verification = flutterwave.verify(
            data.get("id") or (data.get("data") or {}).get("id")
        )
        successful = (
            verification.get("simulated")
            or (verification.get("data") or {}).get("status") == "successful"
        )
        intent.raw_response = verification
        if successful:
            _settle_intent(intent)
        else:
            intent.status = PaymentIntent.Status.FAILED
            intent.save(update_fields=["status", "raw_response", "updated_at"])
        return Response({"status": "ok"})


class WithdrawalViewSet(viewsets.ModelViewSet):
    serializer_class = WithdrawalSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return WithdrawalRequest.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        amount = serializer.validated_data["amount"]
        fee = Decimal(str(settings.WITHDRAWAL_FEE_FLAT))
        net = amount - fee

        wallet, _ = Wallet.objects.get_or_create(user=user)
        try:
            wallet.debit(
                amount,
                WalletTransaction.Type.WITHDRAWAL,
                description="Withdrawal request",
            )
        except InsufficientFunds as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"amount": str(exc)})

        serializer.save(user=user, fee=fee, net_amount=net)

        from apps.accounts.models import User

        for admin in User.objects.filter(is_staff=True)[:10]:
            notify(
                admin,
                "Withdrawal requested",
                f"{user.display_name} requested KES {amount} (net {net}).",
                Notification.Kind.PAYMENT,
                link="/admin/withdrawals",
            )


class AdminWithdrawalViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdminRole]
    serializer_class = WithdrawalSerializer
    queryset = WithdrawalRequest.objects.select_related("user").all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "method"]

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        withdrawal = self.get_object()
        if withdrawal.status == WithdrawalRequest.Status.PAID:
            return Response({"detail": "Already paid."}, status=status.HTTP_400_BAD_REQUEST)
        withdrawal.status = WithdrawalRequest.Status.PAID
        withdrawal.processed_by = request.user
        withdrawal.processed_at = timezone.now()
        withdrawal.notes = request.data.get("notes", withdrawal.notes)
        withdrawal.save()
        notify(
            withdrawal.user,
            "Withdrawal paid",
            f"KES {withdrawal.net_amount} has been sent to {withdrawal.destination}.",
            Notification.Kind.PAYMENT,
            link="/wallet",
        )
        return Response(WithdrawalSerializer(withdrawal).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        withdrawal = self.get_object()
        if withdrawal.status in (WithdrawalRequest.Status.PAID, WithdrawalRequest.Status.REJECTED):
            return Response({"detail": "Already settled."}, status=status.HTTP_400_BAD_REQUEST)
        # Money was debited on request, so a rejection must put it back.
        wallet, _ = Wallet.objects.get_or_create(user=withdrawal.user)
        wallet.credit(
            withdrawal.amount,
            WalletTransaction.Type.REFUND,
            description=f"Withdrawal {withdrawal.reference} rejected",
        )
        withdrawal.status = WithdrawalRequest.Status.REJECTED
        withdrawal.processed_by = request.user
        withdrawal.processed_at = timezone.now()
        withdrawal.notes = request.data.get("notes", "Rejected by admin")
        withdrawal.save()
        notify(
            withdrawal.user,
            "Withdrawal rejected",
            f"KES {withdrawal.amount} has been returned to your wallet. {withdrawal.notes}",
            Notification.Kind.PAYMENT,
            link="/wallet",
        )
        return Response(WithdrawalSerializer(withdrawal).data)


class SubscriptionView(APIView):
    """Writer Pro plan: a lower platform fee for a monthly charge."""

    def get(self, request):
        subscription, _ = Subscription.objects.get_or_create(writer=request.user)
        return Response(
            {
                **SubscriptionSerializer(subscription).data,
                "standard_fee_percent": settings.PLATFORM_FEE_PERCENT,
                "pro_fee_percent": settings.PLATFORM_FEE_PERCENT_PRO,
            }
        )

    @transaction.atomic
    def post(self, request):
        if not request.user.is_writer:
            return Response(
                {"detail": "Subscriptions are for writer accounts."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plan = request.data.get("plan", Subscription.Plan.PRO)
        subscription, _ = Subscription.objects.get_or_create(writer=request.user)

        if plan == Subscription.Plan.FREE:
            subscription.plan = Subscription.Plan.FREE
            subscription.active = False
            subscription.renews_at = None
            subscription.save()
            return Response(SubscriptionSerializer(subscription).data)

        price = Decimal(request.data.get("monthly_price") or "1500")
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        try:
            wallet.debit(
                price,
                WalletTransaction.Type.SUBSCRIPTION,
                description="Writer Pro subscription (1 month)",
            )
        except InsufficientFunds as exc:
            return Response(
                {"detail": str(exc), "code": "insufficient_funds"},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        subscription.plan = Subscription.Plan.PRO
        subscription.monthly_price = price
        subscription.fee_rate_override = Decimal(str(settings.PLATFORM_FEE_PERCENT_PRO))
        subscription.active = True
        subscription.renews_at = timezone.now() + timedelta(days=30)
        subscription.save()

        notify(
            request.user,
            "Writer Pro active",
            f"Your platform fee is now {settings.PLATFORM_FEE_PERCENT_PRO}% for the next 30 days.",
            Notification.Kind.PAYMENT,
            link="/earnings",
        )
        return Response(SubscriptionSerializer(subscription).data)
