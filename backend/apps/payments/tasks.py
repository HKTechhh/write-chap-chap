import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=30)


@shared_task(name="apps.payments.tasks.send_withdrawal_payout")
def send_withdrawal_payout(withdrawal_id):
    """Send one pending withdrawal to the writer's M-Pesa."""
    from .payouts import PayoutError, initiate_withdrawal_payout

    try:
        withdrawal = initiate_withdrawal_payout(withdrawal_id)
    except PayoutError as exc:
        logger.info("Skipped payout for withdrawal %s: %s", withdrawal_id, exc)
        return {"skipped": str(exc)}
    return {"status": withdrawal.status}


@shared_task(name="apps.payments.tasks.flag_stale_payouts")
def flag_stale_payouts():
    """Hourly: alert admins to payouts with no result from Safaricom for 30+ minutes."""
    from .models import WithdrawalRequest
    from .payouts import _notify_admins

    marker = "No result from Safaricom"
    stale = WithdrawalRequest.objects.filter(
        status=WithdrawalRequest.Status.PROCESSING,
        submitted_at__lt=timezone.now() - STALE_AFTER,
    ).exclude(result_desc__startswith=marker)

    count = 0
    for withdrawal in stale:
        withdrawal.result_desc = f"{marker} after 30 minutes."
        withdrawal.save(update_fields=["result_desc", "updated_at"])
        _notify_admins(
            "M-Pesa payout still unconfirmed",
            f"{withdrawal.reference} has had no result for over 30 minutes. Check the Daraja portal.",
        )
        count += 1
    return {"flagged": count}
