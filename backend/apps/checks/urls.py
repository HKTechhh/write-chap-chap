from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminCheckRequestViewSet, CheckPricingView, CheckRequestViewSet

router = DefaultRouter()
router.register("check-requests", CheckRequestViewSet, basename="check-requests")
router.register("admin/check-requests", AdminCheckRequestViewSet, basename="admin-check-requests")

urlpatterns = [
    path("check-requests/pricing/", CheckPricingView.as_view(), name="check_pricing"),
    path("", include(router.urls)),
]
