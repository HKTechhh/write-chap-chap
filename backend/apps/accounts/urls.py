from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminStatsView,
    AdminUserViewSet,
    ClientProfileView,
    KycSubmitView,
    NotificationViewSet,
    PublicWriterViewSet,
    WriterProfileView,
)

router = DefaultRouter()
router.register("writers", PublicWriterViewSet, basename="writers")
router.register("notifications", NotificationViewSet, basename="notifications")
router.register("admin/users", AdminUserViewSet, basename="admin-users")

urlpatterns = [
    path("profile/writer/", WriterProfileView.as_view(), name="writer_profile"),
    path("profile/client/", ClientProfileView.as_view(), name="client_profile"),
    path("profile/kyc/", KycSubmitView.as_view(), name="kyc_submit"),
    path("admin/stats/", AdminStatsView.as_view(), name="admin_stats"),
    path("", include(router.urls)),
]
