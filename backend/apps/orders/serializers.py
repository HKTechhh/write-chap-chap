from django.utils import timezone
from rest_framework import serializers

from apps.accounts.serializers import PublicWriterSerializer, UserSerializer

from .models import (
    Bid,
    Deliverable,
    Dispute,
    Fine,
    Order,
    OrderAttachment,
    OrderStatus,
    OrderType,
    Review,
)
from .utils import count_words_in_file


class OrderAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderAttachment
        fields = ["id", "file", "original_name", "size_bytes", "created_at"]
        read_only_fields = ["original_name", "size_bytes", "created_at"]


class BidSerializer(serializers.ModelSerializer):
    writer_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Bid
        fields = [
            "id",
            "order",
            "writer",
            "writer_detail",
            "amount",
            "delivery_time_hours",
            "message",
            "status",
            "is_boosted",
            "created_at",
        ]
        read_only_fields = ["order", "writer", "status", "is_boosted", "created_at"]

    def get_writer_detail(self, obj):
        profile = getattr(obj.writer, "writer_profile", None)
        if profile:
            return PublicWriterSerializer(profile).data
        return UserSerializer(obj.writer).data

    def validate(self, attrs):
        order = self.context.get("order")
        request = self.context["request"]

        if order is None:
            raise serializers.ValidationError("Order context missing.")
        if not order.can_be_bid_on:
            raise serializers.ValidationError("This order is not open for bids.")
        if order.client_id == request.user.id:
            raise serializers.ValidationError("You cannot bid on your own order.")

        profile = getattr(request.user, "writer_profile", None)
        if profile and profile.is_suspended:
            raise serializers.ValidationError(
                "Your account is suspended and cannot bid. Contact support."
            )

        # Humanization orders are fixed-price: the bid competes on speed and
        # profile, never on price.
        if order.order_type == OrderType.HUMANIZATION:
            attrs["amount"] = order.budget
        else:
            amount = attrs.get("amount")
            if amount is None or amount <= 0:
                raise serializers.ValidationError({"amount": "Enter a bid amount above zero."})

        hours = attrs.get("delivery_time_hours") or 0
        if hours <= 0:
            raise serializers.ValidationError(
                {"delivery_time_hours": "Delivery time must be at least 1 hour."}
            )
        return attrs


class DeliverableSerializer(serializers.ModelSerializer):
    writer_name = serializers.CharField(source="writer.display_name", read_only=True)

    class Meta:
        model = Deliverable
        fields = [
            "id",
            "order",
            "writer",
            "writer_name",
            "file",
            "original_name",
            "note",
            "version_number",
            "submitted_at",
            "word_count",
            "plagiarism_score",
            "ai_content_score",
            "gptzero_report_url",
            "scan_status",
            "flagged",
            "flag_reason",
        ]
        read_only_fields = [
            "order",
            "writer",
            "version_number",
            "submitted_at",
            "word_count",
            "plagiarism_score",
            "ai_content_score",
            "gptzero_report_url",
            "scan_status",
            "flagged",
            "flag_reason",
            "original_name",
        ]


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.display_name", read_only=True)
    reviewer_avatar = serializers.ImageField(source="reviewer.avatar", read_only=True)
    reviewee_name = serializers.CharField(source="reviewee.display_name", read_only=True)
    order_title = serializers.CharField(source="order.title", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "order",
            "order_title",
            "reviewer",
            "reviewer_name",
            "reviewer_avatar",
            "reviewee",
            "reviewee_name",
            "rating",
            "comment",
            "reply",
            "replied_at",
            "created_at",
        ]
        read_only_fields = ["reviewer", "reviewee", "reply", "replied_at", "created_at"]

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate_order(self, order):
        request = self.context["request"]
        if order.status != OrderStatus.COMPLETED:
            raise serializers.ValidationError(
                "Reviews can only be left on completed orders."
            )
        if request.user.id not in (order.client_id, order.writer_id):
            raise serializers.ValidationError("You were not party to this order.")
        if Review.objects.filter(order=order, reviewer=request.user).exists():
            raise serializers.ValidationError("You have already reviewed this order.")
        return order


class DisputeSerializer(serializers.ModelSerializer):
    raised_by_name = serializers.CharField(source="raised_by.display_name", read_only=True)
    order_title = serializers.CharField(source="order.title", read_only=True)

    class Meta:
        model = Dispute
        fields = [
            "id",
            "order",
            "order_title",
            "raised_by",
            "raised_by_name",
            "reason",
            "evidence",
            "status",
            "resolution",
            "writer_share_percent",
            "resolution_notes",
            "resolved_by",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = [
            "raised_by",
            "status",
            "resolution",
            "writer_share_percent",
            "resolution_notes",
            "resolved_by",
            "resolved_at",
            "created_at",
        ]


class FineSerializer(serializers.ModelSerializer):
    writer_name = serializers.CharField(source="writer.display_name", read_only=True)
    order_title = serializers.CharField(source="order.title", read_only=True)

    class Meta:
        model = Fine
        fields = [
            "id",
            "writer",
            "writer_name",
            "order",
            "order_title",
            "reason",
            "amount",
            "client_refund_portion",
            "platform_portion",
            "days_late",
            "notes",
            "is_waived",
            "created_at",
        ]
        read_only_fields = fields


class OrderListSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.display_name", read_only=True)
    writer_name = serializers.CharField(source="writer.display_name", read_only=True, default=None)
    bid_count = serializers.IntegerField(read_only=True)
    subject_display = serializers.CharField(source="get_subject_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    has_bid = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "title",
            "subject",
            "subject_display",
            "order_type",
            "status",
            "status_display",
            "deadline",
            "budget",
            "currency",
            "word_count",
            "pages",
            "client",
            "client_name",
            "writer",
            "writer_name",
            "bid_count",
            "is_overdue",
            "has_bid",
            "created_at",
        ]

    def get_has_bid(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or not request.user.is_writer:
            return False
        cached = getattr(obj, "_viewer_has_bid", None)
        if cached is not None:
            return cached
        return obj.bids.filter(writer=request.user).exists()


class OrderDetailSerializer(serializers.ModelSerializer):
    client_detail = UserSerializer(source="client", read_only=True)
    writer_detail = UserSerializer(source="writer", read_only=True)
    attachments = OrderAttachmentSerializer(many=True, read_only=True)
    deliverables = DeliverableSerializer(many=True, read_only=True)
    bids = serializers.SerializerMethodField()
    reviews = ReviewSerializer(many=True, read_only=True)
    fines = FineSerializer(many=True, read_only=True)
    disputes = DisputeSerializer(many=True, read_only=True)
    escrow = serializers.SerializerMethodField()
    subject_display = serializers.CharField(source="get_subject_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    quote = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "title",
            "description",
            "subject",
            "subject_display",
            "order_type",
            "status",
            "status_display",
            "deadline",
            "budget",
            "currency",
            "word_count",
            "pages",
            "is_public",
            "client",
            "client_detail",
            "writer",
            "writer_detail",
            "accepted_bid",
            "funded_at",
            "started_at",
            "submitted_at",
            "completed_at",
            "review_deadline",
            "revision_count",
            "was_late",
            "is_overdue",
            "attachments",
            "deliverables",
            "bids",
            "reviews",
            "fines",
            "disputes",
            "escrow",
            "quote",
            "created_at",
        ]
        read_only_fields = [
            "status",
            "client",
            "writer",
            "accepted_bid",
            "funded_at",
            "started_at",
            "submitted_at",
            "completed_at",
            "review_deadline",
            "revision_count",
            "was_late",
        ]

    def get_bids(self, obj):
        """Clients see every bid; a writer only ever sees their own."""
        request = self.context.get("request")
        qs = obj.bids.select_related("writer", "writer__writer_profile")
        if request and request.user.is_authenticated:
            if request.user.is_writer:
                qs = qs.filter(writer=request.user)
            elif request.user.id != obj.client_id and not request.user.is_admin_role:
                return []
        else:
            return []
        return BidSerializer(qs, many=True, context=self.context).data

    def get_escrow(self, obj):
        escrow = getattr(obj, "escrow", None)
        if not escrow:
            return None
        return {
            "amount_held": str(escrow.amount_held),
            "platform_fee": str(escrow.platform_fee),
            "fee_percent": str(escrow.fee_percent),
            "writer_payout": str(escrow.writer_payout),
            "amount_refunded": str(escrow.amount_refunded),
            "status": escrow.status,
            "released_at": escrow.released_at,
        }

    def get_quote(self, obj):
        from .services import quote_order

        return quote_order(obj)


class OrderCreateSerializer(serializers.ModelSerializer):
    attachments = serializers.ListField(
        child=serializers.FileField(), write_only=True, required=False
    )
    publish = serializers.BooleanField(write_only=True, default=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "title",
            "description",
            "subject",
            "order_type",
            "deadline",
            "budget",
            "word_count",
            "attachments",
            "publish",
            "is_public",
        ]
        read_only_fields = ["id"]

    def validate_deadline(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Deadline must be in the future.")
        return value

    def validate(self, attrs):
        order_type = attrs.get("order_type", OrderType.WRITING)
        if order_type == OrderType.WRITING:
            budget = attrs.get("budget") or 0
            if budget <= 0:
                raise serializers.ValidationError({"budget": "Set a budget above zero."})
        return attrs

    def create(self, validated_data):
        files = validated_data.pop("attachments", [])
        publish = validated_data.pop("publish", True)
        request = self.context["request"]

        order = Order(**validated_data, client=request.user)

        if order.order_type == OrderType.HUMANIZATION:
            # Price is derived from the document, never from client input.
            word_count = order.word_count
            if files:
                parsed = count_words_in_file(files[0])
                if parsed:
                    word_count = parsed
            if not word_count:
                raise serializers.ValidationError(
                    {
                        "attachments": "Upload a .docx, .pdf or .txt we can read, "
                        "or supply word_count so we can price the job."
                    }
                )
            order.word_count = word_count
            order.apply_humanization_pricing()

        order.status = OrderStatus.OPEN_FOR_BIDS if publish else OrderStatus.DRAFT
        order.save()

        for uploaded in files:
            OrderAttachment.objects.create(
                order=order,
                file=uploaded,
                original_name=getattr(uploaded, "name", "")[:255],
                size_bytes=getattr(uploaded, "size", 0) or 0,
                uploaded_by=request.user,
            )

        profile = getattr(request.user, "client_profile", None)
        if profile:
            profile.orders_posted_count += 1
            profile.save(update_fields=["orders_posted_count", "updated_at"])

        return order


class OrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["title", "description", "subject", "deadline", "budget", "is_public"]

    def validate(self, attrs):
        order = self.instance
        if order.status not in (OrderStatus.DRAFT, OrderStatus.OPEN_FOR_BIDS):
            raise serializers.ValidationError(
                "An order can only be edited before a bid is accepted."
            )
        if order.order_type == OrderType.HUMANIZATION and "budget" in attrs:
            raise serializers.ValidationError(
                {"budget": "Humanization pricing is fixed and calculated from word count."}
            )
        deadline = attrs.get("deadline")
        if deadline and deadline <= timezone.now():
            raise serializers.ValidationError({"deadline": "Deadline must be in the future."})
        return attrs


class HumanizationQuoteSerializer(serializers.Serializer):
    """Price a document before the client commits to posting it."""

    file = serializers.FileField(required=False)
    word_count = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        if not attrs.get("file") and not attrs.get("word_count"):
            raise serializers.ValidationError("Provide a file or a word count.")
        return attrs


class DisputeResolveSerializer(serializers.Serializer):
    resolution = serializers.ChoiceField(choices=Dispute.Resolution.choices)
    writer_share_percent = serializers.IntegerField(min_value=0, max_value=100, required=False)
    resolution_notes = serializers.CharField(allow_blank=True, required=False)
    apply_strike = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if attrs["resolution"] == Dispute.Resolution.PARTIAL_RELEASE:
            share = attrs.get("writer_share_percent")
            if share is None:
                raise serializers.ValidationError(
                    {"writer_share_percent": "Required for a partial release."}
                )
        return attrs
