from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Conversation(TimeStampedModel):
    """Either an order thread or a support thread."""

    class Kind(models.TextChoices):
        ORDER = "order", "Order thread"
        SUPPORT = "support", "Support"

    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.ORDER)
    order = models.OneToOneField(
        "orders.Order", on_delete=models.CASCADE, null=True, blank=True, related_name="conversation"
    )
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="conversations")
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]

    def __str__(self):
        return f"Conversation<{self.kind} #{self.order_id or self.pk}>"


class Message(TimeStampedModel):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages", null=True, blank=True
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="messages_sent"
    )
    content = models.TextField(help_text="Stored post-moderation — may be masked.")
    attachment = models.FileField(upload_to="chat/%Y/%m/", blank=True, null=True)
    is_read = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)
    was_masked = models.BooleanField(
        default=False, help_text="Contact details were redacted before storage."
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["order", "created_at"])]

    def __str__(self):
        return f"{self.sender.username}: {self.content[:40]}"


class ContactLeakFlag(TimeStampedModel):
    """A blocked or redacted attempt to exchange contact details.

    The *original* text is stored deliberately — an admin arbitrating a
    suspension needs to see exactly what was written, not a masked copy.
    """

    class Action(models.TextChoices):
        BLOCKED = "blocked", "Blocked before delivery"
        MASKED = "masked", "Delivered with contact details masked"
        FLAGGED = "flagged", "Delivered, flagged for review"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="contact_leak_flags"
    )
    order = models.ForeignKey(
        "orders.Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="contact_leak_flags"
    )
    message = models.ForeignKey(
        Message, on_delete=models.SET_NULL, null=True, blank=True, related_name="leak_flags"
    )
    original_content = models.TextField()
    masked_content = models.TextField(blank=True)
    detected_kinds = models.JSONField(default=list)
    detections = models.JSONField(default=list)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.MEDIUM)
    action_taken = models.CharField(max_length=10, choices=Action.choices, default=Action.BLOCKED)
    strike_applied = models.BooleanField(default=False)

    reviewed = models.BooleanField(default=False, db_index=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leak_flags_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    is_false_positive = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["reviewed", "-created_at"])]

    def __str__(self):
        return f"Leak flag {self.severity} by {self.user.username} ({self.action_taken})"
