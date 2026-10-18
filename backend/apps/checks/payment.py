"""M-Pesa payment for a Document Check.

The client pays KES 120 up front. The request only reaches the admin queue once
Safaricom confirms the payment, so nobody works on an unpaid document.
"""
import re

from django.conf import settings
from django.db import transaction

from apps.accounts.models import Notification, User, notify
from apps.payments.gateways import GatewayError, mpesa
from apps.payments.models import PaymentIntent

from .models import CheckRequest

PHONE_RE = re.compile(r"^254[17]\d{8}$")


def normalise_phone(raw):
    phone = mpesa.normalize_phone(raw or "")
    return phone if PHONE_RE.match(phone) else None


def start_payment(check, phone):
    """Send an STK push for ``check``. Returns the PaymentIntent.

    Raises GatewayError if the prompt could not be sent. Simulates (and settles
    at once) only when Daraja isn't configured AND DEBUG is on, so production never
    hands out free reports.
    """
    # Any earlier unanswered prompt is superseded by this one.
    check.payment_intents.filter(status=PaymentIntent.Status.PENDING).update(
        status=PaymentIntent.Status.CANCELED
    )
    intent = PaymentIntent.objects.create(
        user=check.requested_by,
        check_request=check,
        provider=PaymentIntent.Provider.MPESA,
        amount=check.total_price,
        phone=phone,
    )
    try:
        if not mpesa.is_configured and not settings.DEBUG:
            raise GatewayError("M-Pesa payments are not available right now. Please try again later.")
        result = mpesa.stk_push(
            phone=phone,
            amount=check.total_price,
            reference=check.reference,
            description="Penspan document check",
        )
    except GatewayError as exc:
        intent.status = PaymentIntent.Status.FAILED
        intent.failure_reason = str(exc)[:255]
        intent.save(update_fields=["status", "failure_reason", "updated_at"])
        raise

    intent.provider_reference = result.get("CheckoutRequestID", "")
    intent.raw_response = result
    intent.save(update_fields=["provider_reference", "raw_response", "updated_at"])
    if result.get("simulated"):
        settle_check_payment(intent)
        intent.refresh_from_db()
    return intent


@transaction.atomic
def settle_check_payment(intent):
    """Mark the check paid and release it to the admin queue, exactly once."""
    intent = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
    if intent.status == PaymentIntent.Status.SUCCESS:
        return intent
    check = CheckRequest.objects.select_for_update().get(pk=intent.check_request_id)
    intent.status = PaymentIntent.Status.SUCCESS
    intent.save(update_fields=["status", "updated_at"])

    check.payment_status = CheckRequest.PaymentStatus.PAID
    fields = ["payment_status", "updated_at"]
    if check.status == CheckRequest.Status.AWAITING_PAYMENT:
        check.status = CheckRequest.Status.PENDING
        fields.append("status")
    check.save(update_fields=fields)

    for admin in User.objects.filter(is_staff=True)[:10]:
        notify(
            admin,
            "New document check request",
            f"{check.requester_display} paid KES {check.total_price} for an AI + similarity "
            f"check — {check.reference}.",
            Notification.Kind.SYSTEM,
            link="/admin/checks",
        )
    if check.requested_by:
        notify(
            check.requested_by,
            "Payment received",
            f"KES {check.total_price} received for document check {check.reference}.",
            Notification.Kind.PAYMENT,
            link=f"/check-my-paper?ref={check.reference}",
        )
    return intent


def payment_state(check):
    """('paid' | 'pending' | 'failed' | 'none', message) for the public tracking view."""
    if check.payment_status != CheckRequest.PaymentStatus.UNPAID:
        return "paid", ""
    intent = check.payment_intents.first()
    if intent is None:
        return "none", ""
    if intent.status == PaymentIntent.Status.PENDING:
        return "pending", "Check your phone and enter your M-Pesa PIN."
    return "failed", intent.failure_reason or "The payment was not completed."
