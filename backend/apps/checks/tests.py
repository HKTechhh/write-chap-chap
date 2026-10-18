from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role, User

from .models import CheckRequest


# Keep tests off the real Daraja sandbox even when backend/.env holds live-looking keys.
NO_DARAJA = {"MPESA_CONSUMER_KEY": "", "MPESA_CONSUMER_SECRET": "", "MPESA_SHORTCODE": "", "MPESA_PASSKEY": ""}


@override_settings(DEBUG=True, **NO_DARAJA)
class DocumentCheckBundleTests(APITestCase):
    """A Document Check is always the AI + similarity bundle for one flat price."""

    def setUp(self):
        self.anon = APIClient()
        self.admin = User.objects.create_user(
            username="boss", password="Passw0rd!23", role=Role.ADMIN, is_staff=True
        )

    def _submit(self, **extra):
        document = SimpleUploadedFile("paper.txt", b"hello world " * 50, content_type="text/plain")
        data = {"document": document, "contact_email": "v@example.com", "contact_phone": "0712345678", **extra}
        return self.anon.post("/api/check-requests/", data, format="multipart")

    def test_pricing_endpoint_lists_the_bundle(self):
        data = self.anon.get("/api/check-requests/pricing/").data
        self.assertEqual(data["price"], 120)
        self.assertEqual(
            [r["value"] for r in data["report_types"]], ["ai_content", "similarity_links"]
        )

    def test_request_is_always_the_bundle_at_flat_price(self):
        response = self._submit()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["total_price"]), Decimal("120.00"))
        self.assertEqual(response.data["report_types"], ["ai_content", "similarity_links"])

    def test_explicit_full_bundle_is_accepted(self):
        response = self._submit(report_types=["similarity_links", "ai_content"])
        self.assertEqual(response.status_code, 201, response.data)

    def test_single_report_is_rejected(self):
        for single in (["ai_content"], ["similarity_links"], ["ai_content", "plagiarism"]):
            response = self._submit(report_types=single)
            self.assertEqual(response.status_code, 400, single)
        self.assertEqual(CheckRequest.objects.count(), 0)

    def test_cannot_deliver_with_only_one_report_uploaded(self):
        request_id = self._submit().data["id"]
        admin = APIClient()
        admin.force_authenticate(self.admin)

        admin.post(
            f"/api/admin/check-requests/{request_id}/reports/",
            {"report_type": "ai_content", "score": "12"},
            format="multipart",
        )
        early = admin.post(f"/api/admin/check-requests/{request_id}/deliver/")
        self.assertEqual(early.status_code, 400)

        admin.post(
            f"/api/admin/check-requests/{request_id}/reports/",
            {"report_type": "similarity_links", "score": "8"},
            format="multipart",
        )
        done = admin.post(f"/api/admin/check-requests/{request_id}/deliver/")
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["status"], "delivered")

    def test_unknown_report_type_cannot_be_uploaded(self):
        request_id = self._submit().data["id"]
        admin = APIClient()
        admin.force_authenticate(self.admin)
        response = admin.post(
            f"/api/admin/check-requests/{request_id}/reports/",
            {"report_type": "turnitin"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)


@override_settings(DEBUG=True, **NO_DARAJA)
class DocumentCheckDeliverablesTests(APITestCase):
    """One document in, two documents out: an AI report and a plagiarism/similarity report."""

    def setUp(self):
        self.anon = APIClient()
        self.admin_user = User.objects.create_user(
            username="boss2", password="Passw0rd!23", role=Role.ADMIN, is_staff=True
        )
        self.admin = APIClient()
        self.admin.force_authenticate(self.admin_user)
        document = SimpleUploadedFile("paper.txt", b"hello world " * 50, content_type="text/plain")
        created = self.anon.post(
            "/api/check-requests/",
            {"document": document, "contact_email": "v@example.com", "contact_phone": "0712345678"},
            format="multipart",
        )
        self.pk, self.reference = created.data["id"], created.data["reference"]

    def _upload(self, report_type):
        return self.admin.post(
            f"/api/admin/check-requests/{self.pk}/reports/",
            {"report_type": report_type, "score": "10", "report_url": "https://example.com/r"},
            format="multipart",
        )

    def _track(self):
        return self.anon.get(f"/api/check-requests/track/{self.reference}/").data

    def test_the_client_is_promised_two_named_deliverables(self):
        slots = self._track()["deliverables"]
        self.assertEqual([s["report_type"] for s in slots], ["ai_content", "similarity_links"])
        self.assertEqual([s["label"] for s in slots], ["AI report", "Plagiarism / similarity report"])
        self.assertEqual({s["state"] for s in slots}, {"waiting"})

    def test_undelivered_reports_are_hidden_from_the_client(self):
        self._upload("ai_content")
        self._upload("similarity_links")

        tracked = self._track()
        self.assertEqual(tracked["reports"], [])
        self.assertEqual({s["state"] for s in tracked["deliverables"]}, {"waiting"})
        self.assertTrue(all(s["report"] is None for s in tracked["deliverables"]))

        # The admin still sees both as uploaded.
        admin_view = self.admin.get(f"/api/admin/check-requests/{self.pk}/").data
        self.assertEqual({s["state"] for s in admin_view["deliverables"]}, {"uploaded"})

    def test_client_receives_both_documents_after_delivery(self):
        self._upload("ai_content")
        self._upload("similarity_links")
        self.assertEqual(self.admin.post(f"/api/admin/check-requests/{self.pk}/deliver/").status_code, 200)

        tracked = self._track()
        self.assertEqual(len(tracked["reports"]), 2)
        self.assertEqual({s["state"] for s in tracked["deliverables"]}, {"delivered"})
        self.assertTrue(all(s["report"] for s in tracked["deliverables"]))

    def test_one_report_uploaded_shows_progress_to_admin_only(self):
        self._upload("ai_content")
        admin_view = self.admin.get(f"/api/admin/check-requests/{self.pk}/").data
        states = {s["report_type"]: s["state"] for s in admin_view["deliverables"]}
        self.assertEqual(states, {"ai_content": "uploaded", "similarity_links": "waiting"})
        self.assertEqual(self.admin.post(f"/api/admin/check-requests/{self.pk}/deliver/").status_code, 400)


class DocumentCheckPaymentTests(APITestCase):
    """The client pays KES 120 by M-Pesa prompt; unpaid checks never reach the admin queue."""

    def setUp(self):
        self.anon = APIClient()
        self.admin_user = User.objects.create_user(
            username="boss3", password="Passw0rd!23", role=Role.ADMIN, is_staff=True
        )
        self.admin = APIClient()
        self.admin.force_authenticate(self.admin_user)

    def _submit(self, **extra):
        document = SimpleUploadedFile("paper.txt", b"hello world " * 50, content_type="text/plain")
        data = {"document": document, "contact_email": "v@example.com", "contact_phone": "0712345678", **extra}
        return self.anon.post("/api/check-requests/", data, format="multipart")

    def _queue(self):
        return self.admin.get("/api/admin/check-requests/").data["results"]

    def test_phone_is_required_and_must_be_safaricom(self):
        for phone in ("", "12345", "0612345678"):
            response = self._submit(contact_phone=phone)
            self.assertEqual(response.status_code, 400, phone)
        self.assertEqual(CheckRequest.objects.count(), 0)

    @override_settings(DEBUG=True, **NO_DARAJA)
    def test_simulated_payment_releases_the_request_to_the_admin(self):
        response = self._submit(contact_phone="+254 712 345 678")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["payment_state"], "paid")
        check = CheckRequest.objects.get()
        self.assertEqual(check.contact_phone, "254712345678")
        self.assertEqual(check.payment_status, "paid")
        self.assertEqual(check.status, "pending")
        self.assertEqual(len(self._queue()), 1)

    @override_settings(DEBUG=False, **NO_DARAJA)
    def test_production_without_daraja_refuses_rather_than_giving_it_away(self):
        response = self._submit()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["payment_state"], "failed")
        check = CheckRequest.objects.get()
        self.assertEqual(check.payment_status, "unpaid")
        self.assertEqual(check.status, "awaiting_payment")
        self.assertEqual(self._queue(), [])

    def _live_submit(self):
        with mock.patch("apps.checks.payment.mpesa") as gateway:
            gateway.is_configured = True
            gateway.normalize_phone.side_effect = lambda p: __import__(
                "apps.payments.gateways", fromlist=["mpesa"]
            ).mpesa.normalize_phone(p)
            gateway.stk_push.return_value = {"simulated": False, "CheckoutRequestID": "ws_CO_1"}
            response = self._submit()
        return response, gateway

    def test_stk_push_is_sent_and_request_waits_for_the_callback(self):
        response, gateway = self._live_submit()
        self.assertEqual(response.status_code, 201, response.data)
        gateway.stk_push.assert_called_once()
        kwargs = gateway.stk_push.call_args.kwargs
        self.assertEqual(kwargs["phone"], "254712345678")
        self.assertEqual(kwargs["amount"], Decimal("120.00"))
        self.assertEqual(response.data["payment_state"], "pending")
        self.assertEqual(self._queue(), [])

        callback = {"Body": {"stkCallback": {"CheckoutRequestID": "ws_CO_1", "ResultCode": 0}}}
        self.assertEqual(self.anon.post("/api/payments/mpesa/callback/", callback, format="json").status_code, 200)
        # A repeated callback must not notify or settle twice.
        self.anon.post("/api/payments/mpesa/callback/", callback, format="json")

        check = CheckRequest.objects.get()
        self.assertEqual((check.payment_status, check.status), ("paid", "pending"))
        self.assertEqual(len(self._queue()), 1)

    def test_cancelled_prompt_stays_unpaid_and_can_be_retried(self):
        self._live_submit()
        callback = {
            "Body": {"stkCallback": {"CheckoutRequestID": "ws_CO_1", "ResultCode": 1032, "ResultDesc": "Request cancelled by user"}}
        }
        self.anon.post("/api/payments/mpesa/callback/", callback, format="json")
        check = CheckRequest.objects.get()
        self.assertEqual(check.payment_status, "unpaid")
        tracked = self.anon.get(f"/api/check-requests/track/{check.reference}/").data
        self.assertEqual(tracked["payment_state"], "failed")
        self.assertIn("cancelled", tracked["payment_message"])
        self.assertEqual(self._queue(), [])

        with override_settings(DEBUG=True, **NO_DARAJA):
            retry = self.anon.post(f"/api/check-requests/pay/{check.reference}/", {"phone": "0722000000"}, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        check.refresh_from_db()
        self.assertEqual((check.payment_status, check.status), ("paid", "pending"))
        again = self.anon.post(f"/api/check-requests/pay/{check.reference}/", {}, format="json")
        self.assertEqual(again.status_code, 400)
