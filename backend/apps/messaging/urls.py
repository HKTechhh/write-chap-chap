from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminContactLeakViewSet,
    ConversationViewSet,
    LeakScanPreviewView,
    OrderMessagesView,
)

router = DefaultRouter()
router.register("conversations", ConversationViewSet, basename="conversations")
router.register("admin/contact-leaks", AdminContactLeakViewSet, basename="admin-contact-leaks")

urlpatterns = [
    path("messages/<int:order_id>/", OrderMessagesView.as_view(), name="order_messages"),
    path("messages/scan/", LeakScanPreviewView.as_view(), name="leak_scan_preview"),
    path("", include(router.urls)),
]
