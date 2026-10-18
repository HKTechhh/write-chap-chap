import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class ReportType(models.TextChoices):
    AI_CONTENT = "ai_content", "AI report"
    SIMILARITY_LINKS = "similarity_links", "Plagiarism / similarity report"


# A Document Check is always both reports together, for one flat price.
# Nobody can order a single report.
BUNDLE_REPORT_TYPES = [ReportType.AI_CONTENT.value, ReportType.SIMILARITY_LINKS.value]


class CheckRequest(TimeStampedModel):
    """A "Check My Paper" submission.

    Admin-only by design: writers must never be able to pre-test a draft
    against the same detector that screens their deliveries.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        PROCESSED = "processed", "Processed"
        DELIVERED = "delivered", "Delivered"
        CANCELED = "canceled", "Canceled"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid"
        WAIVED = "waived", "Waived"

    reference = models.CharField(max_length=20, unique=True, blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="check_requests",
        help_text="Null for anonymous visitors.",
    )
    # Contact details for visitors who aren't registered.
    contact_name = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)

    document = models.FileField(upload_to="check_requests/%Y/%m/")
    original_name = models.CharField(max_length=255, blank=True)
    word_count = models.PositiveIntegerField(null=True, blank=True)
    report_types = models.JSONField(default=list, help_text="List of ReportType values.")
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="KES")
    delivered_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"PSP-{uuid.uuid4().hex[:8].upper()}"
        if not self.report_types:
            self.report_types = list(BUNDLE_REPORT_TYPES)
        if not self.total_price:
            self.total_price = self.calculate_price()
        super().save(*args, **kwargs)

    @staticmethod
    def calculate_price(report_types=None):
        """Flat KES 120 per document for the AI + similarity bundle, whatever its size."""
        return Decimal(str(settings.DOCUMENT_CHECK_PRICE))

    @property
    def requester_display(self):
        if self.requested_by:
            return self.requested_by.display_name
        return self.contact_name or self.contact_email or "Anonymous"

    @property
    def requester_email(self):
        if self.requested_by:
            return self.requested_by.email
        return self.contact_email


class CheckReport(TimeStampedModel):
    check_request = models.ForeignKey(
        CheckRequest, on_delete=models.CASCADE, related_name="reports"
    )
    report_type = models.CharField(max_length=20, choices=ReportType.choices)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    file = models.FileField(upload_to="check_reports/%Y/%m/", blank=True, null=True)
    report_url = models.URLField(blank=True)
    score = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, help_text="Headline percentage."
    )
    summary = models.TextField(blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="check_reports_processed",
    )
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["report_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["check_request", "report_type"], name="one_report_per_type_per_request"
            )
        ]

    def __str__(self):
        return f"{self.get_report_type_display()} for {self.check_request.reference}"

    def save(self, *args, **kwargs):
        if not self.price:
            # The bundle price is split evenly across the two reports.
            self.price = Decimal(str(settings.DOCUMENT_CHECK_PRICE)) / len(BUNDLE_REPORT_TYPES)
        super().save(*args, **kwargs)
