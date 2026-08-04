from rest_framework import serializers

from .models import ContactLeakFlag, Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.display_name", read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)
    sender_avatar = serializers.ImageField(source="sender.avatar", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "order",
            "sender",
            "sender_name",
            "sender_role",
            "sender_avatar",
            "content",
            "attachment",
            "is_read",
            "is_system",
            "was_masked",
            "created_at",
        ]
        read_only_fields = ["sender", "is_read", "is_system", "was_masked", "created_at"]


class MessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(allow_blank=True, required=False, default="")
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate(self, attrs):
        if not (attrs.get("content") or "").strip() and not attrs.get("attachment"):
            raise serializers.ValidationError("Write a message or attach a file.")
        return attrs


class ConversationSerializer(serializers.ModelSerializer):
    order_title = serializers.CharField(source="order.title", read_only=True, default=None)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "kind", "order", "order_title", "last_message_at", "last_message", "unread_count"]

    def get_last_message(self, obj):
        message = obj.messages.order_by("-created_at").first()
        return MessageSerializer(message).data if message else None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request:
            return 0
        return obj.messages.filter(is_read=False).exclude(sender=request.user).count()


class ContactLeakFlagSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)
    order_title = serializers.CharField(source="order.title", read_only=True, default=None)
    reviewed_by_name = serializers.CharField(
        source="reviewed_by.display_name", read_only=True, default=None
    )

    class Meta:
        model = ContactLeakFlag
        fields = [
            "id",
            "user",
            "user_name",
            "user_role",
            "order",
            "order_title",
            "original_content",
            "masked_content",
            "detected_kinds",
            "detections",
            "severity",
            "action_taken",
            "strike_applied",
            "reviewed",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "review_notes",
            "is_false_positive",
            "created_at",
        ]
        read_only_fields = fields


class LeakScanPreviewSerializer(serializers.Serializer):
    """Dry-run the detector — powers the live warning as the user types."""

    content = serializers.CharField(allow_blank=True)
