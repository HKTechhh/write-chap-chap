from django.conf import settings
from rest_framework import serializers

from .models import BUNDLE_REPORT_TYPES, CheckReport, CheckRequest, ReportType


class CheckReportSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(source="get_report_type_display", read_only=True)
    processed_by_name = serializers.CharField(
        source="processed_by.display_name", read_only=True, default=None
    )

    class Meta:
        model = CheckReport
        fields = [
            "id",
            "check_request",
            "report_type",
            "report_type_display",
            "price",
            "file",
            "report_url",
            "score",
            "summary",
            "processed_by_name",
            "delivered_at",
            "created_at",
        ]
        read_only_fields = ["price", "processed_by_name", "created_at"]


class CheckRequestCreateSerializer(serializers.ModelSerializer):
    # Optional and informational: a check is always the AI + similarity bundle.
    report_types = serializers.ListField(
        child=serializers.CharField(), required=False, write_only=True
    )

    class Meta:
        model = CheckRequest
        fields = [
            "id",
            "reference",
            "contact_name",
            "contact_email",
            "contact_phone",
            "document",
            "report_types",
            "notes",
            "total_price",
            "currency",
            "status",
        ]
        read_only_fields = ["id", "reference", "total_price", "status", "currency"]

    def validate(self, attrs):
        request = self.context.get("request")
        anonymous = not (request and request.user.is_authenticated)
        if anonymous and not attrs.get("contact_email"):
            raise serializers.ValidationError(
                {"contact_email": "We need an email address to send your report to."}
            )
        requested = attrs.pop("report_types", None)
        if requested is not None and sorted(requested) != sorted(BUNDLE_REPORT_TYPES):
            raise serializers.ValidationError(
                {"report_types": "Document checks come as one bundle: AI report and similarity report together."}
            )
        attrs["report_types"] = list(BUNDLE_REPORT_TYPES)
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        document = validated_data.get("document")

        instance = CheckRequest(**validated_data)
        if request and request.user.is_authenticated:
            instance.requested_by = request.user
            if not instance.contact_email:
                instance.contact_email = request.user.email
        instance.original_name = getattr(document, "name", "")[:255]

        from apps.orders.utils import count_words_in_file

        if document:
            instance.word_count = count_words_in_file(document)

        instance.total_price = CheckRequest.calculate_price()
        instance.save()
        return instance


def _deliverable_slots(request, only_delivered):
    """The two documents a client receives, one slot per report, in a fixed order.

    ``only_delivered`` hides reports (and their scores and files) until the admin
    has delivered the whole check, so a visitor with a reference cannot see work
    that is still in progress or not yet released.
    """
    by_type = {report.report_type: report for report in request.reports.all()}
    slots = []
    for report_type in BUNDLE_REPORT_TYPES:
        report = by_type.get(report_type)
        visible = report is not None and (report.delivered_at is not None or not only_delivered)
        if report is None:
            state = "waiting"
        elif report.delivered_at is not None:
            state = "delivered"
        else:
            state = "uploaded"
        if only_delivered and not visible and state == "uploaded":
            state = "waiting"
        slots.append(
            {
                "report_type": report_type,
                "label": ReportType(report_type).label,
                "state": state,
                "report": CheckReportSerializer(report).data if visible else None,
            }
        )
    return slots


class CheckRequestSerializer(serializers.ModelSerializer):
    """Admin view of a check, including reports that are not delivered yet."""

    only_delivered = False

    reports = CheckReportSerializer(many=True, read_only=True)
    deliverables = serializers.SerializerMethodField()
    requester_display = serializers.CharField(read_only=True)
    requester_email = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = CheckRequest
        fields = [
            "id",
            "reference",
            "requested_by",
            "requester_display",
            "requester_email",
            "contact_name",
            "contact_email",
            "contact_phone",
            "document",
            "original_name",
            "word_count",
            "report_types",
            "notes",
            "status",
            "status_display",
            "payment_status",
            "total_price",
            "currency",
            "delivered_at",
            "admin_notes",
            "reports",
            "deliverables",
            "created_at",
        ]
        read_only_fields = fields

    def get_deliverables(self, obj):
        return _deliverable_slots(obj, self.only_delivered)


class CheckRequestPublicSerializer(CheckRequestSerializer):
    """What the requester sees: reports appear only once delivered, no admin notes."""

    only_delivered = True
    reports = serializers.SerializerMethodField()
    admin_notes = serializers.SerializerMethodField()

    def get_reports(self, obj):
        delivered = [report for report in obj.reports.all() if report.delivered_at is not None]
        return CheckReportSerializer(delivered, many=True).data

    def get_admin_notes(self, obj):
        return ""


class CheckPricingSerializer(serializers.Serializer):
    """Static pricing metadata for the public Check My Paper form."""

    @staticmethod
    def payload():
        return {
            "price": settings.DOCUMENT_CHECK_PRICE,
            "currency": "KES",
            # Always both, never selectable: shown to the visitor as what is included.
            "report_types": [
                {"value": value, "label": ReportType(value).label} for value in BUNDLE_REPORT_TYPES
            ],
        }
