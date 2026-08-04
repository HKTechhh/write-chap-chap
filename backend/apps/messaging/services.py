"""Moderation pipeline sitting between a typed message and the database."""
from django.conf import settings
from django.utils import timezone

from apps.accounts.models import Notification, notify

from .leak_detection import Severity, scan
from .models import ContactLeakFlag, Message


class MessageBlocked(Exception):
    """Raised when a message cannot be delivered as written."""

    def __init__(self, scan_result, flag):
        self.scan_result = scan_result
        self.flag = flag
        super().__init__(scan_result.summary())


def moderate_and_send(*, sender, content, order=None, conversation=None, attachment=None):
    """Scan, then either send, mask, or block.

    Returns ``(message, scan_result)``. Raises :class:`MessageBlocked` when the
    content is withheld, so the caller can return a 422 with guidance.
    """
    result = scan(content)

    if result.is_clean:
        message = _create_message(sender, content, order, conversation, attachment, masked=False)
        return message, result

    if result.should_block:
        flag = _record_flag(
            sender,
            order,
            result,
            action=ContactLeakFlag.Action.BLOCKED,
            message=None,
        )
        _apply_strike(sender, flag, result)
        _notify_admins(sender, order, result)
        raise MessageBlocked(result, flag)

    # LOW severity: deliver, but keep a record for the moderation queue.
    message = _create_message(sender, content, order, conversation, attachment, masked=False)
    _record_flag(sender, order, result, action=ContactLeakFlag.Action.FLAGGED, message=message)
    return message, result


def _create_message(sender, content, order, conversation, attachment, masked):
    if conversation is None and order is not None:
        conversation = _conversation_for_order(order)
    message = Message.objects.create(
        conversation=conversation,
        order=order,
        sender=sender,
        content=content,
        attachment=attachment,
        was_masked=masked,
    )
    if conversation:
        conversation.last_message_at = timezone.now()
        conversation.save(update_fields=["last_message_at", "updated_at"])
    return message


def _conversation_for_order(order):
    from .models import Conversation

    conversation, created = Conversation.objects.get_or_create(
        order=order, defaults={"kind": Conversation.Kind.ORDER}
    )
    if created:
        participants = [p for p in (order.client, order.writer) if p]
        conversation.participants.set(participants)
    return conversation


def _record_flag(sender, order, result, action, message=None):
    return ContactLeakFlag.objects.create(
        user=sender,
        order=order,
        message=message,
        original_content=result.original_text,
        masked_content=result.masked_text,
        detected_kinds=result.kinds,
        detections=[d.as_dict() for d in result.detections],
        severity=result.severity.value if result.severity else ContactLeakFlag.Severity.LOW,
        action_taken=action,
    )


def _apply_strike(sender, flag, result):
    """Escalate repeat offenders. Only HIGH-severity leaks count."""
    if result.severity != Severity.HIGH:
        return

    profile = getattr(sender, "writer_profile", None)
    if profile is None:
        return  # clients get flagged and warned, but not tiered/suspended

    profile.contact_leak_strikes += 1
    profile.save(update_fields=["contact_leak_strikes", "updated_at"])
    flag.strike_applied = True
    flag.save(update_fields=["strike_applied", "updated_at"])

    limit = settings.CONTACT_LEAK_STRIKE_LIMIT
    if profile.contact_leak_strikes >= limit:
        profile.add_strike(f"{profile.contact_leak_strikes} off-platform contact attempts")
        notify(
            sender,
            "Account restricted",
            "Repeated attempts to share contact details have added a strike to your "
            "account. Further attempts will lead to suspension.",
            Notification.Kind.MODERATION,
        )
    else:
        remaining = limit - profile.contact_leak_strikes
        notify(
            sender,
            "Warning: contact sharing is not allowed",
            f"That message was blocked. {remaining} more attempt(s) will add a strike "
            "to your account. Keep all communication on Write Chap Chap so escrow "
            "can protect your payment.",
            Notification.Kind.MODERATION,
        )


def _notify_admins(sender, order, result):
    from apps.accounts.models import User

    admins = User.objects.filter(is_staff=True)[:10]
    for admin in admins:
        notify(
            admin,
            "Contact leak blocked",
            f"{sender.display_name} tried to share {result.summary()}"
            + (f" on order #{order.pk}." if order else "."),
            Notification.Kind.MODERATION,
            link="/admin/moderation",
        )
