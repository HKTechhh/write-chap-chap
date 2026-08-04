from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class OrderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    OPEN_FOR_BIDS = "open_for_bids", "Open for bids"
    BID_ACCEPTED = "bid_accepted", "Bid accepted — awaiting funding"
    ESCROWED = "escrowed", "Funded / in escrow"
    IN_PROGRESS = "in_progress", "In progress"
    SUBMITTED = "submitted", "Submitted for review"
    IN_REVISION = "in_revision", "In revision"
    COMPLETED = "completed", "Completed"
    DISPUTED = "disputed", "Disputed"
    CANCELED = "canceled", "Canceled"


#: Statuses where the order is live money-wise and cannot simply be deleted.
ACTIVE_STATUSES = [
    OrderStatus.ESCROWED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.SUBMITTED,
    OrderStatus.IN_REVISION,
    OrderStatus.DISPUTED,
]


class OrderType(models.TextChoices):
    WRITING = "writing", "Writing"
    HUMANIZATION = "humanization", "AI humanization / rewriting"


class Subject(models.TextChoices):
    BUSINESS = "business", "Business & Management"
    NURSING = "nursing", "Nursing & Healthcare"
    LAW = "law", "Law"
    PSYCHOLOGY = "psychology", "Psychology"
    ENGINEERING = "engineering", "Engineering"
    IT = "it", "IT & Computer Science"
    LITERATURE = "literature", "Literature & English"
    HISTORY = "history", "History"
    ECONOMICS = "economics", "Economics & Finance"
    EDUCATION = "education", "Education"
    SCIENCE = "science", "Natural Sciences"
    MARKETING = "marketing", "Marketing & Copywriting"
    OTHER = "other", "Other"


class Order(TimeStampedModel):
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders"
    )
    writer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_orders",
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    subject = models.CharField(max_length=30, choices=Subject.choices, default=Subject.OTHER)
    order_type = models.CharField(
        max_length=20, choices=OrderType.choices, default=OrderType.WRITING, db_index=True
    )
    status = models.CharField(
        max_length=20, choices=OrderStatus.choices, default=OrderStatus.DRAFT, db_index=True
    )

    deadline = models.DateTimeField()
    budget = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="KES")
    word_count = models.PositiveIntegerField(
        null=True, blank=True, help_text="Auto-parsed for humanization orders; drives the locked price."
    )
    pages = models.PositiveIntegerField(null=True, blank=True)
    is_public = models.BooleanField(default=True)

    accepted_bid = models.OneToOneField(
        "Bid", on_delete=models.SET_NULL, null=True, blank=True, related_name="won_order"
    )
    funded_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    review_deadline = models.DateTimeField(
        null=True, blank=True, help_text="Auto-approve fires after this."
    )
    revision_count = models.PositiveIntegerField(default=0)
    was_late = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["order_type", "status"]),
        ]

    def __str__(self):
        return f"#{self.pk} {self.title}"

    # ---------------------------------------------------------------- pricing
    @staticmethod
    def calculate_humanization_price(word_count):
        """KES 50 per 250 words, partial pages rounded up."""
        if not word_count:
            return Decimal("0.00"), 0
        per_page = settings.HUMANIZATION_WORDS_PER_PAGE
        pages = -(-int(word_count) // per_page)  # ceiling division
        return Decimal(pages * settings.HUMANIZATION_PRICE_PER_PAGE), pages

    def apply_humanization_pricing(self):
        price, pages = self.calculate_humanization_price(self.word_count)
        self.budget = price
        self.pages = pages
        return price

    # ---------------------------------------------------------------- state
    @property
    def is_overdue(self):
        return (
            self.deadline
            and timezone.now() > self.deadline
            and self.status in (OrderStatus.IN_PROGRESS, OrderStatus.ESCROWED, OrderStatus.IN_REVISION)
        )

    @property
    def hours_late(self):
        if not self.deadline or timezone.now() <= self.deadline:
            return 0
        return (timezone.now() - self.deadline).total_seconds() / 3600

    @property
    def can_be_bid_on(self):
        return self.status == OrderStatus.OPEN_FOR_BIDS

    @property
    def total_fines(self):
        return self.fines.aggregate(t=models.Sum("amount"))["t"] or Decimal("0")

    def open_for_bids(self):
        self.status = OrderStatus.OPEN_FOR_BIDS
        self.save(update_fields=["status", "updated_at"])


class OrderAttachment(TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="order_attachments/%Y/%m/")
    original_name = models.CharField(max_length=255, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    def __str__(self):
        return self.original_name or self.file.name


class BidStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


class Bid(TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="bids")
    writer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bids"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_time_hours = models.PositiveIntegerField(help_text="Hours from acceptance to delivery.")
    message = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=BidStatus.choices, default=BidStatus.PENDING)
    is_boosted = models.BooleanField(default=False, help_text="Paid placement at the top of the list.")

    class Meta:
        ordering = ["-is_boosted", "created_at"]
        constraints = [
            models.UniqueConstraint(fields=["order", "writer"], name="unique_bid_per_writer_order")
        ]

    def __str__(self):
        return f"Bid<{self.writer.username} on #{self.order_id}>"


class Deliverable(TimeStampedModel):
    class ScanStatus(models.TextChoices):
        PENDING = "pending", "Scan pending"
        RUNNING = "running", "Scan running"
        DONE = "done", "Scan complete"
        FAILED = "failed", "Scan failed"
        SKIPPED = "skipped", "Scan skipped"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="deliverables")
    writer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deliverables"
    )
    file = models.FileField(upload_to="deliverables/%Y/%m/")
    original_name = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)
    version_number = models.PositiveIntegerField(default=1)
    submitted_at = models.DateTimeField(default=timezone.now)

    word_count = models.PositiveIntegerField(null=True, blank=True)
    plagiarism_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    ai_content_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    gptzero_report_url = models.URLField(blank=True)
    scan_status = models.CharField(
        max_length=10, choices=ScanStatus.choices, default=ScanStatus.PENDING
    )
    scan_error = models.CharField(max_length=255, blank=True)
    flagged = models.BooleanField(default=False, db_index=True)
    flag_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-version_number"]

    def __str__(self):
        return f"Deliverable v{self.version_number} for #{self.order_id}"

    def evaluate_flags(self):
        """Set `flagged` from the current scores against configured thresholds."""
        reasons = []
        if self.ai_content_score is not None and float(self.ai_content_score) > settings.AI_CONTENT_THRESHOLD:
            reasons.append(f"AI content {self.ai_content_score}% > {settings.AI_CONTENT_THRESHOLD}%")
        if (
            self.plagiarism_score is not None
            and float(self.plagiarism_score) > settings.PLAGIARISM_THRESHOLD
        ):
            reasons.append(
                f"Plagiarism {self.plagiarism_score}% > {settings.PLAGIARISM_THRESHOLD}%"
            )
        self.flagged = bool(reasons)
        self.flag_reason = "; ".join(reasons)[:255]
        return self.flagged


class Review(TimeStampedModel):
    """Locked to completed orders — a review can only exist behind a real transaction."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_written"
    )
    reviewee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_received"
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    reply = models.TextField(blank=True, help_text="One short response from the reviewee.")
    replied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "reviewer"], name="one_review_per_order_per_reviewer"
            ),
            models.CheckConstraint(
                condition=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="review_rating_between_1_and_5",
            ),
        ]

    def __str__(self):
        return f"{self.rating}★ {self.reviewer.username} → {self.reviewee.username}"


class Dispute(TimeStampedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        UNDER_REVIEW = "under_review", "Under review"
        RESOLVED = "resolved", "Resolved"

    class Resolution(models.TextChoices):
        FULL_RELEASE = "full_release", "Full release to writer"
        PARTIAL_RELEASE = "partial_release", "Partial release + partial refund"
        FULL_REFUND = "full_refund", "Full refund to client"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="disputes")
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="disputes_raised"
    )
    reason = models.TextField()
    evidence = models.FileField(upload_to="disputes/%Y/%m/", blank=True, null=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN, db_index=True)
    resolution = models.CharField(max_length=20, choices=Resolution.choices, blank=True)
    writer_share_percent = models.PositiveSmallIntegerField(
        default=0, help_text="Percent of escrow released to the writer on partial resolution."
    )
    resolution_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispute #{self.pk} on order #{self.order_id} ({self.status})"


class Fine(TimeStampedModel):
    class Reason(models.TextChoices):
        LATE_DELIVERY = "late_delivery", "Late delivery"
        QUALITY = "quality", "Quality failure"
        PLAGIARISM = "plagiarism", "Plagiarism / AI content"
        CONTACT_LEAK = "contact_leak", "Off-platform contact attempt"

    writer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fines"
    )
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="fines", null=True, blank=True
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    client_refund_portion = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_portion = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    days_late = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)
    is_waived = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Fine {self.amount} on {self.writer.username} ({self.reason})"
