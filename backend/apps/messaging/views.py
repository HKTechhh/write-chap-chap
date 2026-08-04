from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsAdminRole
from apps.orders.models import Order

from .leak_detection import scan
from .models import ContactLeakFlag, Conversation, Message
from .serializers import (
    ContactLeakFlagSerializer,
    ConversationSerializer,
    LeakScanPreviewSerializer,
    MessageCreateSerializer,
    MessageSerializer,
)
from .services import MessageBlocked, moderate_and_send


class OrderMessagesView(APIView):
    """GET the thread for an order, POST a new message through moderation."""

    def _get_order(self, request, order_id):
        order = Order.objects.filter(pk=order_id).first()
        if not order:
            return None, Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        allowed = request.user.id in (order.client_id, order.writer_id) or request.user.is_admin_role
        if not allowed:
            return None, Response(
                {"detail": "You are not a party to this order."}, status=status.HTTP_403_FORBIDDEN
            )
        return order, None

    def get(self, request, order_id):
        order, error = self._get_order(request, order_id)
        if error:
            return error
        order.messages.filter(is_read=False).exclude(sender=request.user).update(is_read=True)
        messages = order.messages.select_related("sender").all()
        return Response(MessageSerializer(messages, many=True).data)

    def post(self, request, order_id):
        order, error = self._get_order(request, order_id)
        if error:
            return error

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            message, result = moderate_and_send(
                sender=request.user,
                content=serializer.validated_data.get("content", ""),
                order=order,
                attachment=serializer.validated_data.get("attachment"),
            )
        except MessageBlocked as blocked:
            return Response(
                {
                    "detail": "Message blocked: sharing contact details is not allowed.",
                    "code": "contact_leak_blocked",
                    "summary": blocked.scan_result.summary(),
                    "kinds": blocked.scan_result.kinds,
                    "severity": blocked.scan_result.severity.value,
                    "masked_preview": blocked.scan_result.masked_text,
                    "guidance": (
                        "Keep all communication and payment on Write Chap Chap. Escrow only "
                        "protects you while the work and the money stay on the platform."
                    ),
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        payload = MessageSerializer(message).data
        if not result.is_clean:
            payload["warning"] = result.summary()
        return Response(payload, status=status.HTTP_201_CREATED)


class LeakScanPreviewView(APIView):
    """Client-side pre-check so a writer is warned before they hit send."""

    def post(self, request):
        serializer = LeakScanPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = scan(serializer.validated_data["content"])
        return Response(
            {
                "clean": result.is_clean,
                "blocked": result.should_block,
                "severity": result.severity.value if result.severity else None,
                "kinds": result.kinds,
                "summary": result.summary(),
                "masked_text": result.masked_text,
                "spans": [
                    {"start": d.start, "end": d.end, "kind": d.kind.value} for d in result.detections
                ],
            }
        )


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ConversationSerializer

    def get_queryset(self):
        return (
            Conversation.objects.filter(participants=self.request.user)
            .select_related("order")
            .distinct()
        )


class AdminContactLeakViewSet(viewsets.ReadOnlyModelViewSet):
    """The moderation queue: every blocked or flagged contact attempt."""

    permission_classes = [IsAdminRole]
    serializer_class = ContactLeakFlagSerializer
    queryset = ContactLeakFlag.objects.select_related("user", "order", "reviewed_by").all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["reviewed", "severity", "action_taken", "is_false_positive", "user"]

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        flag = self.get_object()
        flag.reviewed = True
        flag.reviewed_by = request.user
        flag.reviewed_at = timezone.now()
        flag.review_notes = request.data.get("notes", "")
        flag.is_false_positive = bool(request.data.get("is_false_positive", False))

        # A false positive should not leave a strike behind.
        if flag.is_false_positive and flag.strike_applied:
            profile = getattr(flag.user, "writer_profile", None)
            if profile and profile.contact_leak_strikes > 0:
                profile.contact_leak_strikes -= 1
                profile.save(update_fields=["contact_leak_strikes", "updated_at"])
            flag.strike_applied = False

        flag.save()
        return Response(ContactLeakFlagSerializer(flag).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        from django.db.models import Count

        qs = ContactLeakFlag.objects.all()
        return Response(
            {
                "total": qs.count(),
                "unreviewed": qs.filter(reviewed=False).count(),
                "blocked": qs.filter(action_taken=ContactLeakFlag.Action.BLOCKED).count(),
                "false_positives": qs.filter(is_false_positive=True).count(),
                "by_severity": list(qs.values("severity").annotate(count=Count("id"))),
                "by_kind": _kind_breakdown(qs),
                "top_offenders": list(
                    qs.values("user__id", "user__username")
                    .annotate(count=Count("id"))
                    .order_by("-count")[:10]
                ),
            }
        )


def _kind_breakdown(queryset):
    counts = {}
    for kinds in queryset.values_list("detected_kinds", flat=True):
        for kind in kinds or []:
            counts[kind] = counts.get(kind, 0) + 1
    return sorted(
        ({"kind": k, "count": v} for k, v in counts.items()),
        key=lambda row: row["count"],
        reverse=True,
    )
