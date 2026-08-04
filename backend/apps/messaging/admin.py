from django.contrib import admin

from .models import ContactLeakFlag, Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "order", "last_message_at")
    list_filter = ("kind",)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "sender", "short_content", "was_masked", "created_at")
    list_filter = ("was_masked", "is_system")
    search_fields = ("content", "sender__username")

    @admin.display(description="Content")
    def short_content(self, obj):
        return obj.content[:60]


@admin.register(ContactLeakFlag)
class ContactLeakFlagAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "severity",
        "action_taken",
        "detected_kinds",
        "strike_applied",
        "reviewed",
        "created_at",
    )
    list_filter = ("severity", "action_taken", "reviewed", "is_false_positive")
    search_fields = ("user__username", "original_content")
    readonly_fields = ("original_content", "masked_content", "detections", "detected_kinds")
