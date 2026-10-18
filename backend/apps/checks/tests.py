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
