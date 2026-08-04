import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="apps.orders.tasks.scan_deliverable", bind=True, max_retries=2)
def scan_deliverable(self, deliverable_id):
    """Run AI/plagiarism screening on a freshly uploaded deliverable."""
    from apps.accounts.models import Notification, notify

    from .gptzero import GPTZeroError, is_configured, scan_text
    from .models import Deliverable
    from .utils import extract_text

    try:
        deliverable = Deliverable.objects.select_related("order", "writer").get(pk=deliverable_id)
    except Deliverable.DoesNotExist:
        return {"error": "deliverable not found"}

    if not is_configured():
        deliverable.scan_status = Deliverable.ScanStatus.SKIPPED
        deliverable.scan_error = "GPTZero API key not configured"
        deliverable.save(update_fields=["scan_status", "scan_error", "updated_at"])
        return {"skipped": True}

    deliverable.scan_status = Deliverable.ScanStatus.RUNNING
    deliverable.save(update_fields=["scan_status", "updated_at"])

    try:
        text = extract_text(deliverable.file)
        result = scan_text(text)
    except GPTZeroError as exc:
        deliverable.scan_status = Deliverable.ScanStatus.FAILED
        deliverable.scan_error = str(exc)[:255]
        deliverable.save(update_fields=["scan_status", "scan_error", "updated_at"])
        logger.warning("GPTZero scan failed for deliverable %s: %s", deliverable_id, exc)
        return {"failed": str(exc)}

    deliverable.ai_content_score = result["ai_content_score"]
    deliverable.plagiarism_score = result["plagiarism_score"]
    deliverable.gptzero_report_url = result["report_url"] or ""
    deliverable.scan_status = Deliverable.ScanStatus.DONE
    deliverable.scan_error = ""
    flagged = deliverable.evaluate_flags()
    deliverable.save()

    if flagged:
        order = deliverable.order
        notify(
            order.client,
            "Screening flag on your delivery",
            f"The submission for '{order.title}' was flagged: {deliverable.flag_reason}",
            Notification.Kind.MODERATION,
            link=f"/orders/{order.pk}",
        )
        notify(
            deliverable.writer,
            "Your submission was flagged",
            f"Screening flagged '{order.title}': {deliverable.flag_reason}. "
            "Repeated flags count toward strikes.",
            Notification.Kind.MODERATION,
            link=f"/orders/{order.pk}",
        )
        _count_flag_toward_strikes(deliverable.writer)

    return {
        "ai": float(deliverable.ai_content_score or 0),
        "plagiarism": float(deliverable.plagiarism_score or 0),
        "flagged": flagged,
    }


def _count_flag_toward_strikes(writer):
    """Three flagged submissions in 90 days earns a strike."""
    from datetime import timedelta

    from .models import Deliverable

    profile = getattr(writer, "writer_profile", None)
    if not profile:
        return
    recent = Deliverable.objects.filter(
        writer=writer, flagged=True, created_at__gte=timezone.now() - timedelta(days=90)
    ).count()
    if recent and recent % 3 == 0:
        profile.add_strike(f"{recent} flagged submissions in 90 days")


@shared_task(name="apps.orders.tasks.check_overdue_orders")
def check_overdue_orders():
    """Hourly: fine writers whose orders have blown the deadline."""
    from .models import Order, OrderStatus
    from .services import apply_late_fine

    candidates = Order.objects.filter(
        status__in=[OrderStatus.IN_PROGRESS, OrderStatus.IN_REVISION],
        deadline__lt=timezone.now(),
        writer__isnull=False,
    ).select_related("writer", "client")

    fined = 0
    for order in candidates:
        try:
            if apply_late_fine(order):
                fined += 1
        except Exception:
            logger.exception("Failed to apply late fine to order %s", order.pk)
    return {"checked": candidates.count(), "fined": fined}


@shared_task(name="apps.orders.tasks.auto_approve_stale_submissions")
def auto_approve_stale_submissions():
    """Hourly: release escrow on submissions the client never responded to.

    This is the writer's protection against a ghosting client.
    """
    from .models import Order, OrderStatus
    from .services import release_escrow

    stale = Order.objects.filter(
        status=OrderStatus.SUBMITTED,
        review_deadline__lt=timezone.now(),
    ).select_related("writer", "client", "escrow")

    approved = 0
    for order in stale:
        try:
            release_escrow(order, writer_share_percent=100, note="Auto-approved: review window elapsed")
            approved += 1
        except Exception:
            logger.exception("Auto-approve failed for order %s", order.pk)
    return {"auto_approved": approved}
