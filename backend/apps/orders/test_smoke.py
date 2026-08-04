"""End-to-end walk through the whole marketplace over the real HTTP API.

Covers the path a real user takes: register → post → bid → accept → fund →
chat (including a blocked contact leak) → deliver → approve → review → withdraw.
"""
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.messaging.models import ContactLeakFlag, Message
from apps.orders.models import Order, OrderStatus
from apps.payments.models import Wallet, WalletTransaction


@override_settings(PLATFORM_FEE_PERCENT=12, CELERY_TASK_ALWAYS_EAGER=True)
class FullLifecycleSmokeTest(TestCase):
    def setUp(self):
        self.api = APIClient()

    def _register(self, username, role):
        response = self.api.post(
            "/api/auth/register/",
            {
                "username": username,
                "email": f"{username}@example.com",
                "password": "Sup3rSecret!99",
                "password_confirm": "Sup3rSecret!99",
                "role": role,
                "first_name": username.title(),
                "last_name": "Test",
                "phone": "0712345678",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["access"], response.data["user"]

    def test_full_order_lifecycle_over_http(self):
        client_token, client_user = self._register("smokeclient", Role.CLIENT)
        writer_token, writer_user = self._register("smokewriter", Role.WRITER)

        # --- client tops up (simulated, since no gateway keys are configured)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {client_token}")
        topup = self.api.post(
            "/api/wallet/topup/",
            {"amount": "30000", "provider": "mpesa", "phone": "0712345678"},
            format="json",
        )
        self.assertEqual(topup.status_code, 200, topup.data)
        self.assertTrue(topup.data["simulated"])
        self.assertEqual(Decimal(topup.data["wallet"]["balance"]), Decimal("30000.00"))

        # --- client posts an order
        created = self.api.post(
            "/api/orders/",
            {
                "title": "Smoke test essay",
                "description": "2000 words on marketing strategy, APA 7.",
                "subject": "marketing",
                "order_type": "writing",
                "deadline": (timezone.now() + timedelta(days=4)).isoformat(),
                "budget": "10000",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        order_id = created.data["id"]
        self.assertEqual(created.data["status"], OrderStatus.OPEN_FOR_BIDS)

        # --- writer sees it in the open feed and bids
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {writer_token}")
        feed = self.api.get("/api/orders/?tab=open")
        self.assertEqual(feed.status_code, 200)
        self.assertIn(order_id, [row["id"] for row in feed.data["results"]])

        bid = self.api.post(
            f"/api/orders/{order_id}/bids/",
            {"amount": "9000", "delivery_time_hours": 48, "message": "I can do this well."},
            format="json",
        )
        self.assertEqual(bid.status_code, 201, bid.data)
        bid_id = bid.data["id"]

        # --- client accepts and funds
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {client_token}")
        accept = self.api.post(f"/api/bids/{bid_id}/accept/")
        self.assertEqual(accept.status_code, 200, accept.data)
        self.assertEqual(accept.data["order"]["status"], OrderStatus.BID_ACCEPTED)
        # Fee breakdown must be visible before committing.
        self.assertEqual(accept.data["quote"]["platform_fee"], "1080.00")
        self.assertEqual(accept.data["quote"]["writer_receives"], "7920.00")

        fund = self.api.post(f"/api/orders/{order_id}/fund/")
        self.assertEqual(fund.status_code, 200, fund.data)
        self.assertEqual(fund.data["status"], OrderStatus.IN_PROGRESS)
        self.assertEqual(fund.data["escrow"]["status"], "held")

        client_wallet = Wallet.objects.get(user__username="smokeclient")
        client_wallet.refresh_from_db()
        self.assertEqual(client_wallet.balance, Decimal("21000.00"))

        # --- chat: a clean message goes through
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {writer_token}")
        clean = self.api.post(
            f"/api/messages/{order_id}/",
            {"content": "Starting on the outline now, will share by tomorrow."},
            format="multipart",
        )
        self.assertEqual(clean.status_code, 201, clean.data)
        self.assertEqual(Message.objects.filter(order_id=order_id).count(), 1)

        # --- chat: a contact leak is blocked and never stored
        leaked = self.api.post(
            f"/api/messages/{order_id}/",
            {"content": "easier if you just whatsapp me on 0722113344"},
            format="multipart",
        )
        self.assertEqual(leaked.status_code, 422, leaked.data)
        self.assertEqual(leaked.data["code"], "contact_leak_blocked")
        self.assertIn("phone", leaked.data["kinds"])
        self.assertEqual(Message.objects.filter(order_id=order_id).count(), 1)

        flag = ContactLeakFlag.objects.get()
        self.assertEqual(flag.action_taken, ContactLeakFlag.Action.BLOCKED)
        self.assertIn("0722113344", flag.original_content)

        # --- the live pre-send scanner agrees
        preview = self.api.post(
            "/api/messages/scan/", {"content": "call me on 0722113344"}, format="json"
        )
        self.assertEqual(preview.status_code, 200)
        self.assertTrue(preview.data["blocked"])
        self.assertNotIn("0722113344", preview.data["masked_text"])

        # --- writer delivers
        document = SimpleUploadedFile(
            "essay.txt",
            b"This is the completed essay body. " * 60,
            content_type="text/plain",
        )
        delivered = self.api.post(
            f"/api/orders/{order_id}/deliverables/",
            {"file": document, "note": "Final draft attached."},
            format="multipart",
        )
        self.assertEqual(delivered.status_code, 201, delivered.data)
        self.assertIsNotNone(delivered.data["word_count"])

        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.status, OrderStatus.SUBMITTED)
        self.assertIsNotNone(order.review_deadline)

        # --- client approves; escrow releases net of fee
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {client_token}")
        approved = self.api.post(f"/api/orders/{order_id}/approve/")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data["status"], OrderStatus.COMPLETED)

        writer_wallet = Wallet.objects.get(user__username="smokewriter")
        writer_wallet.refresh_from_db()
        self.assertEqual(writer_wallet.balance, Decimal("7920.00"))

        # --- both sides review
        review = self.api.post(
            "/api/reviews/",
            {"order": order_id, "rating": 5, "comment": "Delivered early, exactly to brief."},
            format="json",
        )
        self.assertEqual(review.status_code, 201, review.data)

        writer_profile = User.objects.get(username="smokewriter").writer_profile
        writer_profile.refresh_from_db()
        self.assertEqual(writer_profile.rating_avg, Decimal("5.00"))
        self.assertEqual(writer_profile.completed_orders, 1)

        # --- withdrawal is gated on KYC
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {writer_token}")
        blocked_withdrawal = self.api.post(
            "/api/wallet/withdrawals/",
            {"amount": "5000", "method": "mpesa", "destination": "0712345678"},
            format="json",
        )
        self.assertEqual(blocked_withdrawal.status_code, 400)

        writer = User.objects.get(username="smokewriter")
        writer.kyc_status = "approved"
        writer.save(update_fields=["kyc_status"])

        withdrawal = self.api.post(
            "/api/wallet/withdrawals/",
            {"amount": "5000", "method": "mpesa", "destination": "0712345678"},
            format="json",
        )
        self.assertEqual(withdrawal.status_code, 201, withdrawal.data)
        self.assertEqual(Decimal(withdrawal.data["net_amount"]), Decimal("4950.00"))

        writer_wallet.refresh_from_db()
        self.assertEqual(writer_wallet.balance, Decimal("2920.00"))

    def test_humanization_flow_prices_from_the_document(self):
        client_token, _ = self._register("humanclient", Role.CLIENT)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {client_token}")

        # 300 words -> 2 pages -> KES 100
        body = (" ".join(["word"] * 300)).encode()
        upload = SimpleUploadedFile("draft.txt", body, content_type="text/plain")

        quote = self.api.post("/api/humanization/quote/", {"file": upload}, format="multipart")
        self.assertEqual(quote.status_code, 200, quote.data)
        self.assertEqual(quote.data["word_count"], 300)
        self.assertEqual(quote.data["pages"], 2)
        self.assertEqual(quote.data["price"], "100")

        upload2 = SimpleUploadedFile("draft.txt", body, content_type="text/plain")
        created = self.api.post(
            "/api/orders/",
            {
                "title": "Humanize my draft",
                "description": "Make it read naturally.",
                "order_type": "humanization",
                "deadline": (timezone.now() + timedelta(days=2)).isoformat(),
                "attachments": [upload2],
                "budget": "5",  # should be ignored
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(Decimal(created.data["budget"]), Decimal("100.00"))
        self.assertEqual(created.data["word_count"], 300)

    def test_check_my_paper_is_public_and_priced_per_report(self):
        anonymous = APIClient()
        document = SimpleUploadedFile("paper.txt", b"hello world " * 100, content_type="text/plain")

        response = anonymous.post(
            "/api/check-requests/",
            {
                "document": document,
                "report_types": ["ai_content", "plagiarism"],
                "contact_email": "visitor@example.com",
                "contact_name": "Visitor",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["total_price"]), Decimal("300.00"))
        reference = response.data["reference"]

        tracked = anonymous.get(f"/api/check-requests/track/{reference}/")
        self.assertEqual(tracked.status_code, 200)
        self.assertEqual(tracked.data["status"], "pending")

    def test_writers_cannot_reach_the_admin_check_queue(self):
        writer_token, _ = self._register("nosywriter", Role.WRITER)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {writer_token}")
        for path in (
            "/api/admin/check-requests/",
            "/api/admin/contact-leaks/",
            "/api/admin/disputes/",
            "/api/admin/stats/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.api.get(path).status_code, 403)
