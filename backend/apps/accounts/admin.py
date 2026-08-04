from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ClientProfile, Notification, User, WriterProfile


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "role", "kyc_status", "is_verified", "is_active")
    list_filter = ("role", "kyc_status", "is_verified", "is_active", "is_staff")
    search_fields = ("username", "email", "first_name", "last_name", "phone")
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Platform",
            {"fields": ("role", "phone", "country", "avatar", "is_verified", "kyc_status", "kyc_document")},
        ),
    )


@admin.register(WriterProfile)
class WriterProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "tier",
        "rating_avg",
        "completed_orders",
        "on_time_rate",
        "strikes",
        "contact_leak_strikes",
        "is_suspended",
    )
    list_filter = ("tier", "is_suspended")
    search_fields = ("user__username", "user__email", "headline")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ClientProfile)
class ClientProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "company_name", "orders_posted_count", "total_spent")
    search_fields = ("user__username", "company_name")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")
    search_fields = ("title", "user__username")
