"""Escrow, fee and fine logic.

Everything that moves money lives here so the views stay thin and the rules
stay auditable in one place.
"""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Notification, notify
from apps.payments.models import (
    EscrowTransaction,
    Wallet,
    WalletTransaction,
)

from .models import Fine, Order, OrderStatus

TWO_PLACES = Decimal("0.01")


def money(value):
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def get_fee_percent(writer):
    """Platform cut for this writer — lower if they're on an active Pro plan."""
    subscription = getattr(writer, "subscription", None)
    if subscription:
        return Decimal(str(subscription.effective_fee_percent))
    return Decimal(str(settings.PLATFORM_FEE_PERCENT))


def quote_order(order, writer=None):
    """Fee breakdown shown to both parties before they commit to anything."""
    writer = writer or order.writer
    amount = money(order.budget)
    fee_percent = get_fee_percent(writer) if writer else Decimal(str(settings.PLATFORM_FEE_PERCENT))
    platform_fee = money(amount * fee_percent / 100)
    return {
        "amount": str(amount),
        "fee_percent": str(fee_percent),
        "platform_fee": str(platform_fee),
        "writer_receives": str(money(amount - platform_fee)),
        "currency": order.currency,
    }


class EscrowError(Exception):
    """Raised when an escrow action isn't valid for the order's current state."""


@transaction.atomic
def fund_order_from_wallet(order, actor=None):
    """Move the order's budget from the client's wallet into escrow."""
    if order.status not in (OrderStatus.BID_ACCEPTED, OrderStatus.DRAFT, OrderStatus.OPEN_FOR_BIDS):
        raise EscrowError(f"Order in status '{order.status}' cannot be funded.")
    if not order.writer:
        raise EscrowError("Assign a writer (accept a bid) before funding.")

    amount = money(order.budget)
    if amount <= 0:
        raise EscrowError("Order budget must be greater than zero.")

    wallet, _ = Wallet.objects.get_or_create(user=order.client)
    wallet.debit(
        amount,
        WalletTransaction.Type.ESCROW_FUND,
        order=order,
        description=f"Escrow funding for order #{order.pk}",
    )

    fee_percent = get_fee_percent(order.writer)
    platform_fee = money(amount * fee_percent / 100)

    escrow, _ = EscrowTransaction.objects.update_or_create(
        order=order,
        defaults={
            "amount_held": amount,
            "platform_fee": platform_fee,
            "fee_percent": fee_percent,
            "writer_payout": money(amount - platform_fee),
            "status": EscrowTransaction.Status.HELD,
        },
    )

    order.status = OrderStatus.IN_PROGRESS
    order.funded_at = timezone.now()
    order.started_at = timezone.now()
    order.save(update_fields=["status", "funded_at", "started_at", "updated_at"])

    notify(
        order.writer,
        "Order funded — you can start",
        f"'{order.title}' is funded and in escrow. Deadline: {order.deadline:%d %b %Y %H:%M}.",
        Notification.Kind.PAYMENT,
        link=f"/orders/{order.pk}",
    )
    return escrow


@transaction.atomic
def release_escrow(order, writer_share_percent=100, actor=None, note=""):
    """Release escrow to the writer (minus platform fee), refunding any remainder.

    `writer_share_percent` < 100 is the partial-resolution path used by disputes.
    """
    escrow = getattr(order, "escrow", None)
    if escrow is None:
        raise EscrowError("This order has no escrow record.")
    if escrow.status in (EscrowTransaction.Status.RELEASED, EscrowTransaction.Status.REFUNDED):
        raise EscrowError("Escrow has already been settled.")

    share = Decimal(str(writer_share_percent))
    if share < 0 or share > 100:
        raise EscrowError("Writer share must be between 0 and 100 percent.")

    total = money(escrow.amount_held)
    writer_gross = money(total * share / 100)
    client_refund = money(total - writer_gross)

    # Fines already levied on this order come off the writer's gross first.
    outstanding_fines = money(
        sum(f.amount for f in order.fines.filter(is_waived=False)) or Decimal("0")
    )
    writer_gross = max(Decimal("0.00"), money(writer_gross - outstanding_fines))

    fee_percent = Decimal(str(escrow.fee_percent or settings.PLATFORM_FEE_PERCENT))
    platform_fee = money(writer_gross * fee_percent / 100)
    writer_net = money(writer_gross - platform_fee)

    if writer_net > 0:
        writer_wallet, _ = Wallet.objects.get_or_create(user=order.writer)
        writer_wallet.credit(
            writer_net,
            WalletTransaction.Type.ESCROW_RELEASE,
            order=order,
            description=f"Payout for order #{order.pk} (fee {fee_percent}%)",
        )

    if client_refund > 0:
        client_wallet, _ = Wallet.objects.get_or_create(user=order.client)
        client_wallet.credit(
            client_refund,
            WalletTransaction.Type.REFUND,
            order=order,
            description=f"Partial refund for order #{order.pk}",
        )

    escrow.platform_fee = platform_fee
    escrow.writer_payout = writer_net
    escrow.amount_refunded = client_refund
    escrow.status = (
        EscrowTransaction.Status.RELEASED
        if share == 100
        else EscrowTransaction.Status.PARTIAL_RELEASE
    )
    escrow.released_at = timezone.now()
    escrow.save()

    order.status = OrderStatus.COMPLETED
    order.completed_at = timezone.now()
    order.save(update_fields=["status", "completed_at", "updated_at"])

    _update_completion_stats(order)

    notify(
        order.writer,
        "Payment released",
        f"KES {writer_net} has landed in your wallet for '{order.title}'.",
        Notification.Kind.PAYMENT,
        link=f"/orders/{order.pk}",
    )
    notify(
        order.client,
        "Order completed",
        f"'{order.title}' is complete. Leave a review to help other clients.",
        Notification.Kind.ORDER,
        link=f"/orders/{order.pk}",
    )
    return escrow


@transaction.atomic
def refund_escrow(order, actor=None, note=""):
    """Full refund back to the client; order ends canceled."""
    escrow = getattr(order, "escrow", None)
    if escrow is None:
        raise EscrowError("This order has no escrow record.")
    if escrow.status in (EscrowTransaction.Status.RELEASED, EscrowTransaction.Status.REFUNDED):
        raise EscrowError("Escrow has already been settled.")

    amount = money(escrow.amount_held)
    client_wallet, _ = Wallet.objects.get_or_create(user=order.client)
    client_wallet.credit(
        amount,
        WalletTransaction.Type.REFUND,
        order=order,
        description=note or f"Refund for order #{order.pk}",
    )

    escrow.status = EscrowTransaction.Status.REFUNDED
    escrow.amount_refunded = amount
    escrow.writer_payout = Decimal("0.00")
    escrow.platform_fee = Decimal("0.00")
    escrow.released_at = timezone.now()
    escrow.save()

    order.status = OrderStatus.CANCELED
    order.save(update_fields=["status", "updated_at"])

    notify(
        order.client,
        "Order refunded",
        f"KES {amount} has been returned to your wallet for '{order.title}'.",
        Notification.Kind.PAYMENT,
        link=f"/orders/{order.pk}",
    )
    return escrow


@transaction.atomic
def apply_late_fine(order):
    """Fine a writer for running past the deadline.

    5% of order value per day late, capped at 25%. Half refunds the client,
    half is platform revenue. Idempotent per (order, days_late).
    """
    if not order.writer or not order.is_overdue:
        return None

    days_late = max(1, int(order.hours_late // 24) + (1 if order.hours_late % 24 else 0))
    if order.fines.filter(reason=Fine.Reason.LATE_DELIVERY, days_late__gte=days_late).exists():
        return None  # already fined at this severity

    percent = min(
        Decimal(str(settings.LATE_FINE_PERCENT_PER_DAY)) * days_late,
        Decimal(str(settings.LATE_FINE_MAX_PERCENT)),
    )
    already_fined = money(
        sum(
            f.amount for f in order.fines.filter(reason=Fine.Reason.LATE_DELIVERY, is_waived=False)
        )
        or Decimal("0")
    )
    total_due = money(money(order.budget) * percent / 100)
    increment = money(total_due - already_fined)
    if increment <= 0:
        return None

    client_portion = money(increment / 2)
    platform_portion = money(increment - client_portion)

    fine = Fine.objects.create(
        writer=order.writer,
        order=order,
        reason=Fine.Reason.LATE_DELIVERY,
        amount=increment,
        client_refund_portion=client_portion,
        platform_portion=platform_portion,
        days_late=days_late,
        notes=f"{percent}% of order value at {days_late} day(s) late",
    )

    order.was_late = True
    order.save(update_fields=["was_late", "updated_at"])

    profile = getattr(order.writer, "writer_profile", None)
    if profile:
        recent_late = Fine.objects.filter(
            writer=order.writer,
            reason=Fine.Reason.LATE_DELIVERY,
            is_waived=False,
            created_at__gte=timezone.now() - timedelta(days=90),
        ).count()
        if recent_late >= 3:
            profile.add_strike("3+ late fines in 90 days")

    notify(
        order.writer,
        "Late delivery fine applied",
        f"KES {increment} fined on '{order.title}' — {days_late} day(s) past deadline.",
        Notification.Kind.SYSTEM,
        link=f"/orders/{order.pk}",
    )
    return fine


def _update_completion_stats(order):
    """Roll completed-order counters into both profiles."""
    writer_profile = getattr(order.writer, "writer_profile", None) if order.writer else None
    if writer_profile:
        writer_profile.completed_orders += 1
        escrow = getattr(order, "escrow", None)
        if escrow:
            writer_profile.total_earned = money(
                Decimal(str(writer_profile.total_earned)) + Decimal(str(escrow.writer_payout))
            )
        total = writer_profile.completed_orders
        on_time = total - Order.objects.filter(writer=order.writer, was_late=True).count()
        writer_profile.on_time_rate = money(max(Decimal("0"), Decimal(on_time) / total * 100))
        revisions = Order.objects.filter(writer=order.writer, revision_count__gt=0).count()
        writer_profile.revision_rate = money(Decimal(revisions) / total * 100)
        writer_profile.save(
            update_fields=[
                "completed_orders",
                "total_earned",
                "on_time_rate",
                "revision_rate",
                "updated_at",
            ]
        )
        writer_profile.recalculate_tier()

    client_profile = getattr(order.client, "client_profile", None)
    if client_profile:
        client_profile.orders_completed_count += 1
        client_profile.total_spent = money(
            Decimal(str(client_profile.total_spent)) + money(order.budget)
        )
        client_profile.save(
            update_fields=["orders_completed_count", "total_spent", "updated_at"]
        )


def start_review_window(order):
    """Called when a deliverable lands — opens the client's approval clock."""
    order.status = OrderStatus.SUBMITTED
    order.submitted_at = timezone.now()
    order.review_deadline = timezone.now() + timedelta(hours=settings.REVISION_WINDOW_HOURS)
    order.save(
        update_fields=["status", "submitted_at", "review_deadline", "updated_at"]
    )
