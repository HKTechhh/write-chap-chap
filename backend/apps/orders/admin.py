from django.contrib import admin

from .models import Bid, Deliverable, Dispute, Fine, Order, OrderAttachment, Review


class OrderAttachmentInline(admin.TabularInline):
    model = OrderAttachment
    extra = 0


class BidInline(admin.TabularInline):
    model = Bid
    fk_name = "order"
    extra = 0
    readonly_fields = ("writer", "amount", "delivery_time_hours", "status")


class DeliverableInline(admin.TabularInline):
    model = Deliverable
    extra = 0
    readonly_fields = ("ai_content_score", "plagiarism_score", "scan_status", "flagged")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "client", "writer", "order_type", "status", "budget", "deadline")
    list_filter = ("status", "order_type", "subject", "was_late")
    search_fields = ("title", "description", "client__username", "writer__username")
    date_hierarchy = "created_at"
    inlines = [OrderAttachmentInline, BidInline, DeliverableInline]
    readonly_fields = ("created_at", "updated_at", "funded_at", "completed_at")


@admin.register(Bid)
class BidAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "writer", "amount", "delivery_time_hours", "status")
    list_filter = ("status", "is_boosted")
    search_fields = ("order__title", "writer__username")


@admin.register(Deliverable)
class DeliverableAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "order",
        "writer",
        "version_number",
        "ai_content_score",
        "plagiarism_score",
        "scan_status",
        "flagged",
    )
    list_filter = ("flagged", "scan_status")
    search_fields = ("order__title", "writer__username")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "reviewer", "reviewee", "rating", "created_at")
    list_filter = ("rating",)
    search_fields = ("order__title", "reviewer__username", "reviewee__username")


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "raised_by", "status", "resolution", "created_at")
    list_filter = ("status", "resolution")
    search_fields = ("order__title", "reason")


@admin.register(Fine)
class FineAdmin(admin.ModelAdmin):
    list_display = ("id", "writer", "order", "reason", "amount", "days_late", "is_waived")
    list_filter = ("reason", "is_waived")
    search_fields = ("writer__username", "order__title")
