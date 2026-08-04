from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminWithdrawalViewSet,
    FlutterwaveCallbackView,
    MpesaCallbackView,
    SubscriptionView,
    TopUpView,
    WalletTransactionViewSet,
    WalletView,
    WithdrawalViewSet,
)

router = DefaultRouter()
router.register("wallet/transactions", WalletTransactionViewSet, basename="wallet-transactions")
router.register("wallet/withdrawals", WithdrawalViewSet, basename="withdrawals")
router.register("admin/withdrawals", AdminWithdrawalViewSet, basename="admin-withdrawals")

urlpatterns = [
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("wallet/topup/", TopUpView.as_view(), name="wallet_topup"),
    path("subscription/", SubscriptionView.as_view(), name="subscription"),
    path("payments/mpesa/callback/", MpesaCallbackView.as_view(), name="mpesa_callback"),
    path("payments/flutterwave/callback/", FlutterwaveCallbackView.as_view(), name="flw_callback"),
    path("", include(router.urls)),
]
