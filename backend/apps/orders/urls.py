from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminDisputeViewSet,
    AdminFineViewSet,
    AdminFlaggedDeliverableViewSet,
    BidViewSet,
    DashboardStatsView,
    HumanizationQuoteView,
    OrderViewSet,
    ReviewViewSet,
)

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="orders")
router.register("bids", BidViewSet, basename="bids")
router.register("reviews", ReviewViewSet, basename="reviews")
router.register("admin/disputes", AdminDisputeViewSet, basename="admin-disputes")
router.register("admin/fines", AdminFineViewSet, basename="admin-fines")
router.register(
    "admin/flagged-deliverables", AdminFlaggedDeliverableViewSet, basename="admin-flagged"
)

urlpatterns = [
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard_stats"),
    path("humanization/quote/", HumanizationQuoteView.as_view(), name="humanization_quote"),
    path("", include(router.urls)),
]
