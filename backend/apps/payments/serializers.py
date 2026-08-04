from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from .models import (
    EscrowTransaction,
    PaymentIntent,
    Subscription,
    Wallet,
    WalletTransaction,
    WithdrawalRequest,
)


class WalletTransactionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    order_title = serializers.CharField(source="order.title", read_only=True, default=None)

    class Meta:
        model = WalletTransaction
        fields = [
            "id",
            "type",
            "type_display",
            "direction",
            "amount",
            "balance_after",
            "reference",
            "description",
            "order",
            "order_title",
            "created_at",
        ]
        read_only_fields = fields


class WalletSerializer(serializers.ModelSerializer):
    recent_transactions = serializers.SerializerMethodField()

    class Meta:
        model = Wallet
        fields = ["id", "balance", "pending_balance", "currency", "recent_transactions"]
        read_only_fields = fields

    def get_recent_transactions(self, obj):
        return WalletTransactionSerializer(obj.transactions.all()[:10], many=True).data


class TopUpSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("10"))
    provider = serializers.ChoiceField(
        choices=[PaymentIntent.Provider.MPESA, PaymentIntent.Provider.FLUTTERWAVE],
        default=PaymentIntent.Provider.MPESA,
    )
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["provider"] == PaymentIntent.Provider.MPESA:
            phone = attrs.get("phone") or getattr(self.context["request"].user, "phone", "")
            if not phone:
                raise serializers.ValidationError(
                    {"phone": "An M-Pesa phone number is required for STK push."}
                )
            attrs["phone"] = phone
        return attrs


class WithdrawalSerializer(serializers.ModelSerializer):
    class Meta:
        model = WithdrawalRequest
        fields = [
            "id",
            "amount",
            "fee",
            "net_amount",
            "method",
            "destination",
            "status",
            "reference",
            "notes",
            "created_at",
            "processed_at",
        ]
        read_only_fields = ["fee", "net_amount", "status", "reference", "processed_at", "created_at"]

    def validate_amount(self, value):
        fee = Decimal(str(settings.WITHDRAWAL_FEE_FLAT))
        if value <= fee:
            raise serializers.ValidationError(
                f"Withdrawal must exceed the KES {fee} processing fee."
            )
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        wallet = getattr(user, "wallet", None)
        amount = attrs["amount"]
        if not wallet or wallet.balance < amount:
            raise serializers.ValidationError(
                {"amount": f"Insufficient balance. Available: KES {wallet.balance if wallet else 0}."}
            )
        if user.kyc_status != "approved":
            raise serializers.ValidationError(
                "Complete identity verification (KYC) before withdrawing earnings."
            )
        return attrs


class EscrowSerializer(serializers.ModelSerializer):
    order_title = serializers.CharField(source="order.title", read_only=True)

    class Meta:
        model = EscrowTransaction
        fields = [
            "id",
            "order",
            "order_title",
            "amount_held",
            "platform_fee",
            "fee_percent",
            "writer_payout",
            "amount_refunded",
            "status",
            "released_at",
            "created_at",
        ]
        read_only_fields = fields


class SubscriptionSerializer(serializers.ModelSerializer):
    effective_fee_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )

    class Meta:
        model = Subscription
        fields = [
            "id",
            "plan",
            "fee_rate_override",
            "monthly_price",
            "active",
            "renews_at",
            "effective_fee_percent",
        ]
        read_only_fields = ["fee_rate_override", "monthly_price", "active", "renews_at"]


class PaymentIntentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentIntent
        fields = [
            "id",
            "provider",
            "amount",
            "currency",
            "status",
            "reference",
            "provider_reference",
            "failure_reason",
            "created_at",
        ]
        read_only_fields = fields
