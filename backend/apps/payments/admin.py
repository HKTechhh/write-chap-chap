from django.contrib import admin

from .models import (
    EscrowTransaction,
    PaymentIntent,
    Subscription,
    Wallet,
    WalletTransaction,
    WithdrawalRequest,
)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "currency", "updated_at")
    search_fields = ("user__username", "user__email")


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ("id", "wallet", "type", "direction", "amount", "balance_after", "created_at")
    list_filter = ("type", "direction")
    search_fields = ("reference", "wallet__user__username")
    date_hierarchy = "created_at"


@admin.register(EscrowTransaction)
class EscrowTransactionAdmin(admin.ModelAdmin):
    list_display = ("order", "amount_held", "platform_fee", "writer_payout", "status", "released_at")
    list_filter = ("status",)
    search_fields = ("order__title", "reference")


@admin.register(PaymentIntent)
class PaymentIntentAdmin(admin.ModelAdmin):
    list_display = ("reference", "user", "provider", "amount", "status", "created_at")
    list_filter = ("provider", "status")
    search_fields = ("reference", "provider_reference", "user__username")


@admin.register(WithdrawalRequest)
class WithdrawalRequestAdmin(admin.ModelAdmin):
    list_display = ("reference", "user", "amount", "fee", "net_amount", "status", "created_at")
    list_filter = ("status", "method")
    search_fields = ("reference", "user__username", "destination")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("writer", "plan", "active", "monthly_price", "renews_at")
    list_filter = ("plan", "active")
