import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models, transaction

from apps.common.models import TimeStampedModel


class Wallet(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet"
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pending_balance = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, help_text="Funds committed to escrow."
    )
    currency = models.CharField(max_length=3, default="KES")

    def __str__(self):
        return f"Wallet<{self.user.username}: {self.currency} {self.balance}>"

    @transaction.atomic
    def credit(self, amount, tx_type, reference="", order=None, description=""):
        amount = Decimal(str(amount))
        if amount <= 0:
            raise ValueError("Credit amount must be positive.")
        locked = Wallet.objects.select_for_update().get(pk=self.pk)
        locked.balance += amount
        locked.save(update_fields=["balance", "updated_at"])
        self.balance = locked.balance
        return WalletTransaction.objects.create(
            wallet=locked,
            type=tx_type,
            amount=amount,
            direction=WalletTransaction.Direction.CREDIT,
            balance_after=locked.balance,
            reference=reference or uuid.uuid4().hex[:16].upper(),
            order=order,
            description=description,
        )

    @transaction.atomic
    def debit(self, amount, tx_type, reference="", order=None, description="", allow_negative=False):
        amount = Decimal(str(amount))
        if amount <= 0:
            raise ValueError("Debit amount must be positive.")
        locked = Wallet.objects.select_for_update().get(pk=self.pk)
        if locked.balance < amount and not allow_negative:
            raise InsufficientFunds(
                f"Balance {locked.currency} {locked.balance} is below the required {amount}."
            )
        locked.balance -= amount
        locked.save(update_fields=["balance", "updated_at"])
        self.balance = locked.balance
        return WalletTransaction.objects.create(
            wallet=locked,
            type=tx_type,
            amount=amount,
            direction=WalletTransaction.Direction.DEBIT,
            balance_after=locked.balance,
            reference=reference or uuid.uuid4().hex[:16].upper(),
            order=order,
            description=description,
        )


class InsufficientFunds(Exception):
    """Raised when a debit would take a wallet below zero."""


class WalletTransaction(TimeStampedModel):
    class Type(models.TextChoices):
        TOPUP = "topup", "Top-up"
        ESCROW_FUND = "escrow_fund", "Escrow funding"
        ESCROW_RELEASE = "escrow_release", "Escrow release"
        PAYOUT = "payout", "Payout"
        FINE = "fine", "Fine"
        FINE_REFUND = "fine_refund", "Fine refund"
        REFUND = "refund", "Refund"
        WITHDRAWAL = "withdrawal", "Withdrawal"
        WITHDRAWAL_FEE = "withdrawal_fee", "Withdrawal fee"
        PLATFORM_FEE = "platform_fee", "Platform fee"
        SUBSCRIPTION = "subscription", "Subscription"
        CHECK_PAYMENT = "check_payment", "Document check payment"

    class Direction(models.TextChoices):
        CREDIT = "credit", "Credit"
        DEBIT = "debit", "Debit"

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name="transactions")
    type = models.CharField(max_length=20, choices=Type.choices)
    direction = models.CharField(max_length=6, choices=Direction.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=64, db_index=True)
    description = models.CharField(max_length=255, blank=True)
    order = models.ForeignKey(
        "orders.Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="wallet_transactions"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        sign = "+" if self.direction == self.Direction.CREDIT else "-"
        return f"{sign}{self.amount} {self.type} ({self.wallet.user.username})"


class EscrowTransaction(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Awaiting funding"
        HELD = "held", "Held in escrow"
        RELEASED = "released", "Released to writer"
        PARTIAL_RELEASE = "partial_release", "Partially released"
        REFUNDED = "refunded", "Refunded to client"

    order = models.OneToOneField(
        "orders.Order", on_delete=models.CASCADE, related_name="escrow"
    )
    amount_held = models.DecimalField(max_digits=12, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    writer_payout = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_refunded = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    released_at = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=64, unique=True, default=uuid.uuid4)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Escrow #{self.order_id}: {self.amount_held} ({self.status})"


class PaymentIntent(TimeStampedModel):
    """A single attempt to move real money in (top-up / order funding)."""

    class Provider(models.TextChoices):
        MPESA = "mpesa", "M-Pesa"
        FLUTTERWAVE = "flutterwave", "Flutterwave"
        MANUAL = "manual", "Manual / admin"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_intents"
    )
    order = models.ForeignKey(
        "orders.Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="payment_intents"
    )
    provider = models.CharField(max_length=15, choices=Provider.choices, default=Provider.MPESA)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")
    phone = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField(max_length=64, unique=True, default=uuid.uuid4)
    provider_reference = models.CharField(max_length=128, blank=True, db_index=True)
    raw_response = models.JSONField(default=dict, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.provider} {self.amount} ({self.status})"


class WithdrawalRequest(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="withdrawals"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    method = models.CharField(max_length=20, default="mpesa")
    destination = models.CharField(max_length=64, help_text="Phone number or account reference.")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    reference = models.CharField(max_length=64, unique=True, default=uuid.uuid4)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="withdrawals_processed",
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Withdrawal {self.amount} by {self.user.username} ({self.status})"


class Subscription(TimeStampedModel):
    class Plan(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"

    writer = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.CharField(max_length=10, choices=Plan.choices, default=Plan.FREE)
    fee_rate_override = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Platform fee percent while this subscription is active.",
    )
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    active = models.BooleanField(default=False)
    renews_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.writer.username}: {self.plan}"

    @property
    def effective_fee_percent(self):
        if self.active and self.fee_rate_override is not None:
            return Decimal(str(self.fee_rate_override))
        if self.active and self.plan == self.Plan.PRO:
            return Decimal(str(settings.PLATFORM_FEE_PERCENT_PRO))
        return Decimal(str(settings.PLATFORM_FEE_PERCENT))
