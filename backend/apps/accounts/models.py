from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class Role(models.TextChoices):
    CLIENT = "client", "Client"
    WRITER = "writer", "Writer"
    ADMIN = "admin", "Admin"


class KycStatus(models.TextChoices):
    NOT_SUBMITTED = "not_submitted", "Not submitted"
    PENDING = "pending", "Pending review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class WriterTier(models.TextChoices):
    NEW = "new", "New"
    VERIFIED = "verified", "Verified"
    EXPERT = "expert", "Expert"


class User(AbstractUser):
    """Platform user. Role is chosen at signup and locked from that point."""

    email = models.EmailField("email address", unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CLIENT, db_index=True)
    phone = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=64, default="Kenya")
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    kyc_status = models.CharField(
        max_length=20, choices=KycStatus.choices, default=KycStatus.NOT_SUBMITTED
    )
    kyc_document = models.FileField(upload_to="kyc/", blank=True, null=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_client(self):
        return self.role == Role.CLIENT

    @property
    def is_writer(self):
        return self.role == Role.WRITER

    @property
    def is_admin_role(self):
        return self.role == Role.ADMIN or self.is_staff

    @property
    def display_name(self):
        return self.get_full_name() or self.username


class WriterProfile(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="writer_profile")
    headline = models.CharField(max_length=140, blank=True)
    bio = models.TextField(blank=True)
    skills = models.JSONField(default=list, blank=True)
    subjects = models.JSONField(default=list, blank=True)
    languages = models.JSONField(default=list, blank=True)
    years_experience = models.PositiveIntegerField(default=0)

    tier = models.CharField(max_length=10, choices=WriterTier.choices, default=WriterTier.NEW)
    rating_avg = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    completed_orders = models.PositiveIntegerField(default=0)
    on_time_rate = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    revision_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    dispute_count = models.PositiveIntegerField(default=0)
    disputes_lost = models.PositiveIntegerField(default=0)
    strikes = models.PositiveIntegerField(default=0)
    contact_leak_strikes = models.PositiveIntegerField(default=0)
    is_suspended = models.BooleanField(default=False)
    suspended_reason = models.CharField(max_length=255, blank=True)
    total_earned = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["-rating_avg", "-completed_orders"]

    def __str__(self):
        return f"WriterProfile<{self.user.username}>"

    def recalculate_tier(self):
        """Promote/demote based on volume, rating and reliability.

        Strikes always pin a writer back to `new` — reliability is the gate,
        not raw volume.
        """
        previous = self.tier
        if self.strikes >= 3 or self.is_suspended:
            self.tier = WriterTier.NEW
        elif (
            self.completed_orders >= 25
            and float(self.rating_avg) >= 4.6
            and float(self.on_time_rate) >= 95
            and self.strikes == 0
        ):
            self.tier = WriterTier.EXPERT
        elif (
            self.completed_orders >= 5
            and float(self.rating_avg) >= 4.0
            and float(self.on_time_rate) >= 85
        ):
            self.tier = WriterTier.VERIFIED
        else:
            self.tier = WriterTier.NEW
        if previous != self.tier:
            self.save(update_fields=["tier", "updated_at"])
        return self.tier

    def add_strike(self, reason=""):
        self.strikes += 1
        if self.strikes >= 5:
            self.is_suspended = True
            self.suspended_reason = reason or "Accumulated 5 strikes"
        self.save(update_fields=["strikes", "is_suspended", "suspended_reason", "updated_at"])
        self.recalculate_tier()

    @property
    def can_withdraw(self):
        return self.user.kyc_status == KycStatus.APPROVED


class ClientProfile(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_profile")
    company_name = models.CharField(max_length=140, blank=True)
    industry = models.CharField(max_length=80, blank=True)
    orders_posted_count = models.PositiveIntegerField(default=0)
    orders_completed_count = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rating_avg = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"ClientProfile<{self.user.username}>"


class Notification(TimeStampedModel):
    class Kind(models.TextChoices):
        ORDER = "order", "Order"
        BID = "bid", "Bid"
        PAYMENT = "payment", "Payment"
        DISPUTE = "dispute", "Dispute"
        MODERATION = "moderation", "Moderation"
        SYSTEM = "system", "System"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SYSTEM)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} -> {self.user.username}"

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])


def notify(user, title, body="", kind=Notification.Kind.SYSTEM, link=""):
    """Small helper so call sites stay one-liners."""
    return Notification.objects.create(user=user, title=title, body=body, kind=kind, link=link)
