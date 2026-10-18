"""M-Pesa B2C payouts for withdrawal requests.

Lifecycle of a withdrawal that is paid out through Daraja:

    pending ──send──▶ processing ──result 0──▶ paid
       ▲                  │
       │ (Daraja refused) └─result ≠ 0──▶ failed   (wallet refunded)
       └──────────────────┘

The wallet is debited when the withdrawal is requested, so:
* ``paid``    — nothing more to do.
* ``failed``  — Safaricom definitively reported the payment did not happen, so the
                money is returned to the wallet automatically.
* uncertain   — a timeout or 5xx when submitting leaves the withdrawal in
                ``processing`` and alerts admins instead of guessing. Refunding
                a payment that actually went through would pay the writer twice.
"""
import hashlib
import hmac
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Notification, User, notify

from .gateways import GatewayError, mpesa
from .models import Wallet, WalletTransaction, WithdrawalRequest

logger = logging.getLogger(__name__)


class PayoutError(Exception):
    """The withdrawal is not in a state that can be paid out."""


# ----------------------------------------------------------- callback URLs
# Safaricom does not sign its callbacks, so the URL itself is the secret: it
# carries a token derived from SECRET_KEY that an outsider cannot guess.


def callback_token():
    digest = hmac.new(settings.SECRET_KEY.encode(), b"mpesa-b2c-callback", hashlib.sha256)
    return digest.hexdigest()[:40]


def valid_callback_token(candidate):
    return hmac.compare_digest(str(candidate), callback_token())


def _callback_url(kind):
    override = {"result": settings.MPESA_B2C_RESULT_URL, "timeout": settings.MPESA_B2C_TIMEOUT_URL}[kind]
    if override:
        return override
    return f"{settings.FRONTEND_URL}/api/payments/mpesa/b2c/{kind}/{callback_token()}/"


def b2c_result_url():
    return _callback_url("result")


def b2c_timeout_url():
    return _callback_url("timeout")


# -------------------------------------------------------------- helpers


def _notify_admins(title, message):
    for admin in User.objects.filter(is_staff=True)[:10]:
        notify(admin, title, message, Notification.Kind.PAYMENT, link="/admin/payouts")


def _mark_paid(withdrawal, receipt=""):
    withdrawal.status = WithdrawalRequest.Status.PAID
    withdrawal.mpesa_receipt = receipt[:40]
    withdrawal.processed_at = timezone.now()
    withdrawal.save()
    notify(
        withdrawal.user,
        "Withdrawal paid",
        f"KES {withdrawal.net_amount} was sent to {withdrawal.destination}"
        + (f" (M-Pesa {receipt})." if receipt else "."),
        Notification.Kind.PAYMENT,
        link="/wallet",
    )


def _mark_failed(withdrawal, description):
    """Definitive failure: put the money back in the writer's wallet."""
    wallet, _ = Wallet.objects.get_or_create(user=withdrawal.user)
    wallet.credit(
        withdrawal.amount,
        WalletTransaction.Type.REFUND,
        reference=f"{withdrawal.reference}-refund",
        description=f"Withdrawal {withdrawal.reference} failed: {description}"[:255],
    )
    withdrawal.status = WithdrawalRequest.Status.FAILED
    withdrawal.result_desc = description[:255]
    withdrawal.processed_at = timezone.now()
    withdrawal.save()
    notify(
        withdrawal.user,
        "Withdrawal failed",
        f"The M-Pesa payout could not be completed ({description}). "
        f"KES {withdrawal.amount} has been returned to your wallet.",
        Notification.Kind.PAYMENT,
        link="/wallet",
    )
    _notify_admins("M-Pesa payout failed", f"{withdrawal.reference}: {description}")


# ----------------------------------------------------------------- send


def initiate_withdrawal_payout(withdrawal_id, actor=None):
    """Submit a pending M-Pesa withdrawal to Daraja. Safe to call twice."""
    with transaction.atomic():
        withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal_id)
        if withdrawal.method != "mpesa":
            raise PayoutError("Only M-Pesa withdrawals can be paid through Daraja.")
        if withdrawal.status != WithdrawalRequest.Status.PENDING:
            raise PayoutError(f"Withdrawal is {withdrawal.status}, not pending.")
        withdrawal.status = WithdrawalRequest.Status.PROCESSING
        withdrawal.submitted_at = timezone.now()
        withdrawal.processed_by = actor
        withdrawal.save()

    # The provider call happens outside the transaction on purpose: a slow
    # Daraja response must not hold a database lock.
    try:
        response = mpesa.b2c_payout(
            phone=withdrawal.destination,
            amount=Decimal(withdrawal.net_amount),
            reference=str(withdrawal.reference),
            remarks="PenSpan writer payout",
        )
    except GatewayError as exc:
        withdrawal.refresh_from_db()
        if exc.definitive:
            # Daraja said no, so nothing was sent: back to the queue for a retry.
            withdrawal.status = WithdrawalRequest.Status.PENDING
            withdrawal.result_desc = str(exc)[:255]
            withdrawal.save()
            logger.warning("B2C refused for %s: %s", withdrawal.reference, exc)
        else:
            withdrawal.result_desc = f"Submission uncertain: {exc}"[:255]
            withdrawal.save()
            _notify_admins(
                "M-Pesa payout needs checking",
                f"{withdrawal.reference} may or may not have been sent ({exc}). "
                "Check the Daraja portal before retrying or rejecting it.",
            )
            logger.error("B2C outcome unknown for %s: %s", withdrawal.reference, exc)
        return withdrawal

    withdrawal.refresh_from_db()
    withdrawal.provider_reference = str(response.get("ConversationID", ""))[:128]
    withdrawal.raw_response = response
    if response.get("simulated"):
        # Development without live credentials: no result callback will ever come.
        _mark_paid(withdrawal, receipt=f"SIM-{str(withdrawal.reference)[:8]}")
    else:
        withdrawal.save()
    return withdrawal


# ------------------------------------------------------------ callbacks


def _result_params(result):
    params = (result.get("ResultParameters") or {}).get("ResultParameter") or []
    if isinstance(params, dict):
        params = [params]
    return {item.get("Key"): item.get("Value") for item in params if isinstance(item, dict)}


@transaction.atomic
def settle_b2c_result(payload):
    """Apply Safaricom's final result for a payout. Idempotent."""
    result = (payload or {}).get("Result") or {}
    originator = result.get("OriginatorConversationID")
    withdrawal = (
        WithdrawalRequest.objects.select_for_update().filter(reference__iexact=originator or "").first()
    )
    if not withdrawal:
        logger.warning("B2C result for unknown OriginatorConversationID %r", originator)
        return None

    succeeded = str(result.get("ResultCode")) == "0"
    withdrawal.raw_response = payload
    withdrawal.provider_reference = str(result.get("ConversationID") or withdrawal.provider_reference)[:128]

    if withdrawal.status != WithdrawalRequest.Status.PROCESSING:
        # A late or duplicate callback. Never move money twice; shout if it matters.
        if succeeded and withdrawal.status in (
            WithdrawalRequest.Status.REJECTED,
            WithdrawalRequest.Status.FAILED,
        ):
            _notify_admins(
                "M-Pesa paid a withdrawal that was refunded",
                f"{withdrawal.reference} succeeded at Safaricom but was already "
                f"{withdrawal.status} and refunded. Reconcile it manually.",
            )
            logger.error("B2C success for already-%s withdrawal %s", withdrawal.status, withdrawal.reference)
        withdrawal.save(update_fields=["raw_response", "provider_reference", "updated_at"])
        return withdrawal

    if succeeded:
        params = _result_params(result)
        receipt = str(result.get("TransactionID") or params.get("TransactionReceipt") or "")
        paid = params.get("TransactionAmount")
        if paid is not None and Decimal(str(paid)) != Decimal(int(withdrawal.net_amount)):
            logger.warning(
                "B2C amount mismatch for %s: sent %s, Safaricom reports %s",
                withdrawal.reference, withdrawal.net_amount, paid,
            )
        withdrawal.result_desc = str(result.get("ResultDesc", ""))[:255]
        _mark_paid(withdrawal, receipt=receipt)
    else:
        _mark_failed(withdrawal, str(result.get("ResultDesc") or "Payment failed"))
    return withdrawal


def note_queue_timeout(payload):
    """Safaricom's queue timed out. A result may still arrive, so only flag it."""
    result = (payload or {}).get("Result") or payload or {}
    originator = result.get("OriginatorConversationID")
    withdrawal = WithdrawalRequest.objects.filter(reference__iexact=originator or "").first()
    if withdrawal and withdrawal.status == WithdrawalRequest.Status.PROCESSING:
        withdrawal.result_desc = "Safaricom queue timeout; awaiting result."
        withdrawal.save(update_fields=["result_desc", "updated_at"])
        _notify_admins(
            "M-Pesa payout timed out in queue",
            f"{withdrawal.reference} is still unconfirmed. Check the Daraja portal.",
        )
    return withdrawal
