from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role, User

from .models import CheckRequest


class DocumentCheckBundleTests(APITestCase):
    """A Document Check is always the AI + similarity bundle for one flat price."""

    def setUp(self):
        self.anon = APIClient()
        self.admin = User.objects.create_user(
            username="boss", password="Passw0rd!23", role=Role.ADMIN, is_staff=True
        )

    def _submit(self, **extra):
        document = SimpleUploadedFile("paper.txt", b"hello world " * 50, content_type="text/plain")
        data = {"document": document, "contact_email": "v@example.com", **extra}
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
            {"document": document, "contact_email": "v@example.com"},
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
