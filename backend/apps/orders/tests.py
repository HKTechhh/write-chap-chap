from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.payments.models import EscrowTransaction, InsufficientFunds, Wallet

from .models import Bid, BidStatus, Order, OrderStatus, OrderType
from .services import (
    EscrowError,
    apply_late_fine,
    fund_order_from_wallet,
    quote_order,
    refund_escrow,
    release_escrow,
)


class HumanizationPricingTests(TestCase):
    """KES 50 per 250 words, partial pages always rounded up."""

    def test_pricing_rounds_partial_pages_up(self):
        cases = [
            (1, 50, 1),
            (250, 50, 1),
            (251, 100, 2),
            (500, 100, 2),
            (501, 150, 3),
            (1000, 200, 4),
            (1001, 250, 5),
            (2750, 550, 11),
        ]
        for words, expected_price, expected_pages in cases:
            with self.subTest(words=words):
                price, pages = Order.calculate_humanization_price(words)
                self.assertEqual(price, Decimal(expected_price))
                self.assertEqual(pages, expected_pages)

    def test_zero_words_prices_at_zero(self):
        price, pages = Order.calculate_humanization_price(0)
        self.assertEqual(price, Decimal("0.00"))
        self.assertEqual(pages, 0)


class EscrowLifecycleTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="clientB", email="cb@example.com", password="pw", role=Role.CLIENT
        )
        self.writer_user = User.objects.create_user(
            username="writerB", email="wb@example.com", password="pw", role=Role.WRITER
        )
        self.client_wallet = Wallet.objects.get(user=self.client_user)
        self.writer_wallet = Wallet.objects.get(user=self.writer_user)
        self.client_wallet.credit(Decimal("20000"), "topup")

        self.order = Order.objects.create(
            client=self.client_user,
            title="Marketing essay",
            description="1500 words",
            deadline=timezone.now() + timedelta(days=3),
            budget=Decimal("10000"),
            status=OrderStatus.OPEN_FOR_BIDS,
        )

    def _accept_bid(self):
        bid = Bid.objects.create(
            order=self.order,
            writer=self.writer_user,
            amount=Decimal("10000"),
            delivery_time_hours=48,
        )
        bid.status = BidStatus.ACCEPTED
        bid.save()
        self.order.writer = self.writer_user
        self.order.accepted_bid = bid
        self.order.status = OrderStatus.BID_ACCEPTED
        self.order.save()
        return bid

    @override_settings(PLATFORM_FEE_PERCENT=12)
    def test_funding_moves_money_into_escrow(self):
        self._accept_bid()
        escrow = fund_order_from_wallet(self.order)

        self.client_wallet.refresh_from_db()
        self.assertEqual(self.client_wallet.balance, Decimal("10000.00"))
        self.assertEqual(escrow.amount_held, Decimal("10000.00"))
        self.assertEqual(escrow.status, EscrowTransaction.Status.HELD)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.IN_PROGRESS)
        self.assertIsNotNone(self.order.funded_at)

    def test_funding_without_a_writer_is_rejected(self):
        with self.assertRaises(EscrowError):
            fund_order_from_wallet(self.order)

    def test_funding_beyond_balance_is_rejected(self):
        self._accept_bid()
        self.order.budget = Decimal("999999")
        self.order.save()
        with self.assertRaises(InsufficientFunds):
            fund_order_from_wallet(self.order)

    @override_settings(PLATFORM_FEE_PERCENT=12)
    def test_release_pays_the_writer_net_of_fee(self):
        self._accept_bid()
        fund_order_from_wallet(self.order)
        release_escrow(self.order, writer_share_percent=100)

        self.writer_wallet.refresh_from_db()
        # 10000 - 12% = 8800
        self.assertEqual(self.writer_wallet.balance, Decimal("8800.00"))

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.COMPLETED)
        self.assertEqual(self.order.escrow.status, EscrowTransaction.Status.RELEASED)
        self.assertEqual(self.order.escrow.platform_fee, Decimal("1200.00"))

    @override_settings(PLATFORM_FEE_PERCENT=12)
    def test_partial_release_splits_between_writer_and_client(self):
        self._accept_bid()
        fund_order_from_wallet(self.order)
        release_escrow(self.order, writer_share_percent=60)

        self.writer_wallet.refresh_from_db()
        self.client_wallet.refresh_from_db()
        # writer gross 6000, less 12% = 5280; client refunded 4000
        self.assertEqual(self.writer_wallet.balance, Decimal("5280.00"))
        self.assertEqual(self.client_wallet.balance, Decimal("14000.00"))
        self.assertEqual(self.order.escrow.status, EscrowTransaction.Status.PARTIAL_RELEASE)

    def test_refund_returns_the_full_amount(self):
        self._accept_bid()
        fund_order_from_wallet(self.order)
        refund_escrow(self.order)

        self.client_wallet.refresh_from_db()
        self.writer_wallet.refresh_from_db()
        self.assertEqual(self.client_wallet.balance, Decimal("20000.00"))
        self.assertEqual(self.writer_wallet.balance, Decimal("0.00"))
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CANCELED)

    def test_escrow_cannot_be_settled_twice(self):
        self._accept_bid()
        fund_order_from_wallet(self.order)
        release_escrow(self.order)
        with self.assertRaises(EscrowError):
            release_escrow(self.order)

    @override_settings(PLATFORM_FEE_PERCENT=12)
    def test_completion_updates_writer_stats(self):
        self._accept_bid()
        fund_order_from_wallet(self.order)
        release_escrow(self.order)

        profile = self.writer_user.writer_profile
        profile.refresh_from_db()
        self.assertEqual(profile.completed_orders, 1)
        self.assertEqual(profile.total_earned, Decimal("8800.00"))
        self.assertEqual(profile.on_time_rate, Decimal("100.00"))


class LateFineTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="clientC", email="cc@example.com", password="pw", role=Role.CLIENT
        )
        self.writer_user = User.objects.create_user(
            username="writerC", email="wc@example.com", password="pw", role=Role.WRITER
        )
        self.order = Order.objects.create(
            client=self.client_user,
            writer=self.writer_user,
            title="Late job",
            description="x",
            deadline=timezone.now() - timedelta(days=2, hours=1),
            budget=Decimal("10000"),
            status=OrderStatus.IN_PROGRESS,
        )

    @override_settings(LATE_FINE_PERCENT_PER_DAY=5, LATE_FINE_MAX_PERCENT=25)
    def test_fine_scales_with_days_late(self):
        fine = apply_late_fine(self.order)
        self.assertIsNotNone(fine)
        # 3 days late (2d1h rounds up) -> 15% of 10000
        self.assertEqual(fine.amount, Decimal("1500.00"))
        self.assertEqual(fine.client_refund_portion, Decimal("750.00"))
        self.assertEqual(fine.platform_portion, Decimal("750.00"))
        self.order.refresh_from_db()
        self.assertTrue(self.order.was_late)

    @override_settings(LATE_FINE_PERCENT_PER_DAY=5, LATE_FINE_MAX_PERCENT=25)
    def test_fine_is_not_applied_twice_at_the_same_severity(self):
        self.assertIsNotNone(apply_late_fine(self.order))
        self.assertIsNone(apply_late_fine(self.order))
        self.assertEqual(self.order.fines.count(), 1)

    @override_settings(LATE_FINE_PERCENT_PER_DAY=5, LATE_FINE_MAX_PERCENT=25)
    def test_fine_is_capped(self):
        self.order.deadline = timezone.now() - timedelta(days=30)
        self.order.save()
        fine = apply_late_fine(self.order)
        # capped at 25% of 10000
        self.assertEqual(fine.amount, Decimal("2500.00"))

    def test_on_time_order_is_not_fined(self):
        self.order.deadline = timezone.now() + timedelta(days=1)
        self.order.save()
        self.assertIsNone(apply_late_fine(self.order))

    @override_settings(PLATFORM_FEE_PERCENT=12, LATE_FINE_PERCENT_PER_DAY=5, LATE_FINE_MAX_PERCENT=25)
    def test_outstanding_fine_is_deducted_from_the_payout(self):
        wallet = Wallet.objects.get(user=self.client_user)
        wallet.credit(Decimal("20000"), "topup")
        self.order.status = OrderStatus.BID_ACCEPTED
        self.order.save()
        fund_order_from_wallet(self.order)
        apply_late_fine(self.order)  # 1500
        release_escrow(self.order)

        writer_wallet = Wallet.objects.get(user=self.writer_user)
        writer_wallet.refresh_from_db()
        # (10000 - 1500) less 12% = 7480
        self.assertEqual(writer_wallet.balance, Decimal("7480.00"))


class QuoteTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="clientD", email="cd@example.com", password="pw", role=Role.CLIENT
        )
        self.writer_user = User.objects.create_user(
            username="writerD", email="wd@example.com", password="pw", role=Role.WRITER
        )

    @override_settings(PLATFORM_FEE_PERCENT=15)
    def test_quote_shows_the_full_fee_breakdown(self):
        order = Order.objects.create(
            client=self.client_user,
            writer=self.writer_user,
            title="q",
            description="d",
            deadline=timezone.now() + timedelta(days=1),
            budget=Decimal("4000"),
        )
        quote = quote_order(order)
        self.assertEqual(quote["platform_fee"], "600.00")
        self.assertEqual(quote["writer_receives"], "3400.00")

    @override_settings(PLATFORM_FEE_PERCENT=15, PLATFORM_FEE_PERCENT_PRO=5)
    def test_pro_subscription_lowers_the_fee(self):
        from apps.payments.models import Subscription

        Subscription.objects.create(
            writer=self.writer_user, plan=Subscription.Plan.PRO, active=True
        )
        order = Order.objects.create(
            client=self.client_user,
            writer=self.writer_user,
            title="q",
            description="d",
            deadline=timezone.now() + timedelta(days=1),
            budget=Decimal("4000"),
        )
        quote = quote_order(order)
        self.assertEqual(quote["platform_fee"], "200.00")
        self.assertEqual(quote["writer_receives"], "3800.00")


class OrderApiTests(TestCase):
    """Role boundaries on the order endpoints."""

    def setUp(self):
        from rest_framework.test import APIClient

        self.client_user = User.objects.create_user(
            username="clientE", email="ce@example.com", password="pw", role=Role.CLIENT
        )
        self.writer_user = User.objects.create_user(
            username="writerE", email="we@example.com", password="pw", role=Role.WRITER
        )
        self.other_writer = User.objects.create_user(
            username="writerF", email="wf@example.com", password="pw", role=Role.WRITER
        )
        self.api = APIClient()

    def _post_order(self):
        self.api.force_authenticate(self.client_user)
        return self.api.post(
            "/api/orders/",
            {
                "title": "Test essay",
                "description": "Write 1000 words",
                "subject": "business",
                "order_type": "writing",
                "deadline": (timezone.now() + timedelta(days=5)).isoformat(),
                "budget": "5000",
            },
            format="json",
        )

    def test_client_can_post_an_order(self):
        response = self._post_order()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], OrderStatus.OPEN_FOR_BIDS)

    def test_writer_cannot_post_an_order(self):
        self.api.force_authenticate(self.writer_user)
        response = self.api.post(
            "/api/orders/",
            {
                "title": "x",
                "description": "y",
                "deadline": (timezone.now() + timedelta(days=5)).isoformat(),
                "budget": "100",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_writer_cannot_bid_twice(self):
        order_id = self._post_order().data["id"]
        self.api.force_authenticate(self.writer_user)
        payload = {"amount": "4500", "delivery_time_hours": 48, "message": "I can do this"}
        first = self.api.post(f"/api/orders/{order_id}/bids/", payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        second = self.api.post(f"/api/orders/{order_id}/bids/", payload, format="json")
        self.assertEqual(second.status_code, 400)

    def test_client_cannot_bid_on_their_own_order(self):
        order_id = self._post_order().data["id"]
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            f"/api/orders/{order_id}/bids/",
            {"amount": "100", "delivery_time_hours": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_writer_only_sees_their_own_bid_on_an_order(self):
        order_id = self._post_order().data["id"]
        for writer in (self.writer_user, self.other_writer):
            self.api.force_authenticate(writer)
            self.api.post(
                f"/api/orders/{order_id}/bids/",
                {"amount": "4500", "delivery_time_hours": 48},
                format="json",
            )

        self.api.force_authenticate(self.writer_user)
        detail = self.api.get(f"/api/orders/{order_id}/")
        self.assertEqual(len(detail.data["bids"]), 1)

        self.api.force_authenticate(self.client_user)
        detail = self.api.get(f"/api/orders/{order_id}/")
        self.assertEqual(len(detail.data["bids"]), 2)

    def test_humanization_order_is_auto_priced_and_budget_locked(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            "/api/orders/",
            {
                "title": "Humanize my draft",
                "description": "Rewrite this",
                "order_type": "humanization",
                "deadline": (timezone.now() + timedelta(days=2)).isoformat(),
                "word_count": 1200,
                "budget": "1",  # attempt to undercut the fixed price
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        # 1200 words -> 5 pages -> KES 250
        self.assertEqual(Decimal(response.data["budget"]), Decimal("250.00"))
        self.assertEqual(response.data["pages"], 5)

        patch = self.api.patch(
            f"/api/orders/{response.data['id']}/", {"budget": "10"}, format="json"
        )
        self.assertEqual(patch.status_code, 400)

    def test_review_requires_a_completed_order(self):
        order_id = self._post_order().data["id"]
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            "/api/reviews/",
            {"order": order_id, "rating": 5, "comment": "great"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
