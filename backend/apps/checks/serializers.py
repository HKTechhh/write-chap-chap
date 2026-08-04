from django.conf import settings
from rest_framework import serializers

from .models import CheckReport, CheckRequest, ReportType


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
    report_types = serializers.ListField(
        child=serializers.ChoiceField(choices=ReportType.choices), allow_empty=False
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
        if len(set(attrs["report_types"])) != len(attrs["report_types"]):
            raise serializers.ValidationError({"report_types": "Duplicate report types selected."})
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

        instance.total_price = CheckRequest.calculate_price(validated_data["report_types"])
        instance.save()
        return instance


class CheckRequestSerializer(serializers.ModelSerializer):
    reports = CheckReportSerializer(many=True, read_only=True)
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
            "created_at",
        ]
        read_only_fields = fields


class CheckPricingSerializer(serializers.Serializer):
    """Static pricing metadata for the public Check My Paper form."""

    @staticmethod
    def payload():
        return {
            "price_per_report": settings.DOCUMENT_CHECK_PRICE,
            "currency": "KES",
            "report_types": [
                {"value": value, "label": label} for value, label in ReportType.choices
            ],
        }
