from django.contrib import admin

from .models import CheckReport, CheckRequest


class CheckReportInline(admin.TabularInline):
    model = CheckReport
    extra = 0


@admin.register(CheckRequest)
class CheckRequestAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "requester_display",
        "status",
        "payment_status",
        "total_price",
        "created_at",
    )
    list_filter = ("status", "payment_status")
    search_fields = ("reference", "contact_email", "contact_name", "requested_by__username")
    inlines = [CheckReportInline]
    readonly_fields = ("reference", "word_count", "created_at", "updated_at")


@admin.register(CheckReport)
class CheckReportAdmin(admin.ModelAdmin):
    list_display = ("check_request", "report_type", "price", "score", "delivered_at")
    list_filter = ("report_type",)
