from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Notification, notify
from apps.common.permissions import IsAdminRole
from apps.payments.models import InsufficientFunds

from .models import (
    ACTIVE_STATUSES,
    Bid,
    BidStatus,
    Deliverable,
    Dispute,
    Fine,
    Order,
    OrderAttachment,
    OrderStatus,
    OrderType,
    Review,
)
from .serializers import (
    BidSerializer,
    DeliverableSerializer,
    DisputeResolveSerializer,
    DisputeSerializer,
    FineSerializer,
    HumanizationQuoteSerializer,
    OrderAttachmentSerializer,
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    OrderUpdateSerializer,
    ReviewSerializer,
)
from .services import (
    EscrowError,
    fund_order_from_wallet,
    quote_order,
    refund_escrow,
    release_escrow,
    start_review_window,
)
from .tasks import scan_deliverable
from .utils import count_words_in_file


def _bad_request(message):
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


class OrderViewSet(viewsets.ModelViewSet):
    """Orders, scoped by role: clients see theirs, writers see the open feed + their jobs."""

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "subject", "order_type"]
    search_fields = ["title", "description"]
    ordering_fields = ["created_at", "deadline", "budget"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return OrderCreateSerializer
        if self.action in ("update", "partial_update"):
            return OrderUpdateSerializer
        if self.action == "list":
            return OrderListSerializer
        return OrderDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            Order.objects.select_related("client", "writer", "escrow")
            .annotate(bid_count=Count("bids", distinct=True))
        )

        if user.is_admin_role:
            pass
        elif user.is_writer:
            has_bid = Bid.objects.filter(order=OuterRef("pk"), writer=user)
            qs = qs.annotate(_viewer_has_bid=Exists(has_bid)).filter(
                Q(status=OrderStatus.OPEN_FOR_BIDS, is_public=True)
                | Q(writer=user)
                | Q(bids__writer=user)
            ).distinct()
        else:
            qs = qs.filter(client=user)

        # Convenience tab filter used by the Orders screen.
        tab = self.request.query_params.get("tab")
        if tab == "active":
            qs = qs.filter(status__in=ACTIVE_STATUSES)
        elif tab == "in_review":
            qs = qs.filter(status__in=[OrderStatus.SUBMITTED, OrderStatus.IN_REVISION])
        elif tab == "completed":
            qs = qs.filter(status=OrderStatus.COMPLETED)
        elif tab == "disputed":
            qs = qs.filter(status=OrderStatus.DISPUTED)
        elif tab == "open":
            qs = qs.filter(status=OrderStatus.OPEN_FOR_BIDS)

        return qs

    def create(self, request, *args, **kwargs):
        if not request.user.is_client and not request.user.is_admin_role:
            return _bad_request("Only client accounts can post orders.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(
            OrderDetailSerializer(order, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        if instance.status in ACTIVE_STATUSES:
            raise EscrowError("A funded or active order cannot be deleted — cancel or dispute it.")
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        if order.client_id != request.user.id and not request.user.is_admin_role:
            return _bad_request("You can only delete your own orders.")
        if order.status in ACTIVE_STATUSES:
            return _bad_request("A funded or active order cannot be deleted — cancel or dispute it.")
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------ bids
    @action(detail=True, methods=["get", "post"])
    def bids(self, request, pk=None):
        order = self.get_object()

        if request.method == "GET":
            qs = order.bids.select_related("writer", "writer__writer_profile")
            if request.user.is_writer:
                qs = qs.filter(writer=request.user)
            elif request.user.id != order.client_id and not request.user.is_admin_role:
                return _bad_request("You cannot view bids on this order.")
            return Response(BidSerializer(qs, many=True, context={"request": request}).data)

        if not request.user.is_writer:
            return _bad_request("Only writer accounts can place bids.")
        if order.bids.filter(writer=request.user).exists():
            return _bad_request("You have already bid on this order.")

        serializer = BidSerializer(
            data=request.data, context={"request": request, "order": order}
        )
        serializer.is_valid(raise_exception=True)
        bid = serializer.save(order=order, writer=request.user)

        notify(
            order.client,
            "New bid received",
            f"{request.user.display_name} bid KES {bid.amount} on '{order.title}'.",
            Notification.Kind.BID,
            link=f"/orders/{order.pk}",
        )
        return Response(
            BidSerializer(bid, context={"request": request}).data, status=status.HTTP_201_CREATED
        )

    # ------------------------------------------------------------- lifecycle
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        order = self.get_object()
        if order.client_id != request.user.id:
            return _bad_request("Only the order owner can publish it.")
        if order.status != OrderStatus.DRAFT:
            return _bad_request("Only a draft can be published.")
        order.open_for_bids()
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def fund(self, request, pk=None):
        """Move the budget from the client's wallet into escrow."""
        order = self.get_object()
        if order.client_id != request.user.id and not request.user.is_admin_role:
            return _bad_request("Only the client can fund this order.")
        try:
            fund_order_from_wallet(order, actor=request.user)
        except InsufficientFunds as exc:
            return Response(
                {"detail": str(exc), "code": "insufficient_funds", "required": str(order.budget)},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        except EscrowError as exc:
            return _bad_request(str(exc))
        order.refresh_from_db()
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"])
    def deliverables(self, request, pk=None):
        order = self.get_object()

        if request.method == "GET":
            return Response(
                DeliverableSerializer(order.deliverables.all(), many=True).data
            )

        if order.writer_id != request.user.id:
            return _bad_request("Only the assigned writer can submit work.")
        if order.status not in (OrderStatus.IN_PROGRESS, OrderStatus.IN_REVISION, OrderStatus.ESCROWED):
            return _bad_request(f"Work cannot be submitted while the order is '{order.status}'.")

        uploaded = request.FILES.get("file")
        if not uploaded:
            return _bad_request("Attach the completed document.")

        version = order.deliverables.count() + 1
        deliverable = Deliverable.objects.create(
            order=order,
            writer=request.user,
            file=uploaded,
            original_name=getattr(uploaded, "name", "")[:255],
            note=request.data.get("note", ""),
            version_number=version,
            word_count=count_words_in_file(uploaded),
        )

        start_review_window(order)
        scan_deliverable.delay(deliverable.pk)

        notify(
            order.client,
            "Work delivered",
            f"'{order.title}' has been submitted. You have "
            f"{order.review_deadline and (order.review_deadline - timezone.now()).days or 0} day(s) to review.",
            Notification.Kind.ORDER,
            link=f"/orders/{order.pk}",
        )
        return Response(
            DeliverableSerializer(deliverable).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        order = self.get_object()
        if order.client_id != request.user.id and not request.user.is_admin_role:
            return _bad_request("Only the client can approve this order.")
        if order.status != OrderStatus.SUBMITTED:
            return _bad_request("Only a submitted order can be approved.")
        try:
            release_escrow(order, writer_share_percent=100, actor=request.user)
        except EscrowError as exc:
            return _bad_request(str(exc))
        order.refresh_from_db()
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, pk=None):
        order = self.get_object()
        if order.client_id != request.user.id:
            return _bad_request("Only the client can request a revision.")
        if order.status != OrderStatus.SUBMITTED:
            return _bad_request("Only a submitted order can be sent back for revision.")

        note = request.data.get("note", "").strip()
        if not note:
            return _bad_request("Tell the writer what needs changing.")

        order.status = OrderStatus.IN_REVISION
        order.revision_count += 1
        order.review_deadline = None
        order.save(update_fields=["status", "revision_count", "review_deadline", "updated_at"])

        notify(
            order.writer,
            "Revision requested",
            f"'{order.title}': {note[:200]}",
            Notification.Kind.ORDER,
            link=f"/orders/{order.pk}",
        )
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        order = self.get_object()
        if request.user.id not in (order.client_id, order.writer_id):
            return _bad_request("Only the parties on this order can raise a dispute.")
        if order.status in (OrderStatus.COMPLETED, OrderStatus.CANCELED):
            return _bad_request("This order is already settled.")
        if order.disputes.filter(status__in=["open", "under_review"]).exists():
            return _bad_request("A dispute is already open on this order.")

        serializer = DisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dispute = serializer.save(order=order, raised_by=request.user)

        order.status = OrderStatus.DISPUTED
        order.save(update_fields=["status", "updated_at"])

        counterparty = order.writer if request.user.id == order.client_id else order.client
        if counterparty:
            notify(
                counterparty,
                "Dispute opened",
                f"A dispute was raised on '{order.title}'. An admin will review it.",
                Notification.Kind.DISPUTE,
                link=f"/orders/{order.pk}",
            )
        return Response(DisputeSerializer(dispute).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.client_id != request.user.id and not request.user.is_admin_role:
            return _bad_request("Only the client can cancel this order.")
        if order.status in (OrderStatus.COMPLETED, OrderStatus.CANCELED):
            return _bad_request("This order is already settled.")

        if hasattr(order, "escrow") and order.escrow.status == "held":
            try:
                refund_escrow(order, actor=request.user, note="Order canceled by client")
            except EscrowError as exc:
                return _bad_request(str(exc))
        else:
            order.status = OrderStatus.CANCELED
            order.save(update_fields=["status", "updated_at"])

        if order.writer:
            notify(
                order.writer,
                "Order canceled",
                f"'{order.title}' was canceled by the client.",
                Notification.Kind.ORDER,
                link=f"/orders/{order.pk}",
            )
        order.refresh_from_db()
        return Response(OrderDetailSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="attachments")
    def add_attachment(self, request, pk=None):
        order = self.get_object()
        if request.user.id not in (order.client_id, order.writer_id) and not request.user.is_admin_role:
            return _bad_request("You cannot attach files to this order.")
        uploaded = request.FILES.get("file")
        if not uploaded:
            return _bad_request("No file provided.")
        attachment = OrderAttachment.objects.create(
            order=order,
            file=uploaded,
            original_name=getattr(uploaded, "name", "")[:255],
            size_bytes=getattr(uploaded, "size", 0) or 0,
            uploaded_by=request.user,
        )
        return Response(
            OrderAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED
        )


class BidViewSet(viewsets.ModelViewSet):
    """A writer's own bid list, plus the client's accept/reject actions."""

    serializer_class = BidSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status"]

    def get_queryset(self):
        user = self.request.user
        qs = Bid.objects.select_related("order", "writer", "writer__writer_profile")
        if user.is_admin_role:
            return qs
        if user.is_writer:
            return qs.filter(writer=user)
        return qs.filter(order__client=user)

    def create(self, request, *args, **kwargs):
        return _bad_request("Place bids via /api/orders/{id}/bids/.")

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def accept(self, request, pk=None):
        bid = self.get_object()
        order = bid.order

        if order.client_id != request.user.id:
            return _bad_request("Only the client can accept a bid.")
        if order.status != OrderStatus.OPEN_FOR_BIDS:
            return _bad_request("This order is no longer accepting bids.")

        bid.status = BidStatus.ACCEPTED
        bid.save(update_fields=["status", "updated_at"])
        order.bids.exclude(pk=bid.pk).update(status=BidStatus.REJECTED)

        order.writer = bid.writer
        order.accepted_bid = bid
        # Humanization price is fixed; for writing orders the bid sets the price.
        if order.order_type != OrderType.HUMANIZATION:
            order.budget = bid.amount
        order.status = OrderStatus.BID_ACCEPTED
        order.save(update_fields=["writer", "accepted_bid", "budget", "status", "updated_at"])

        notify(
            bid.writer,
            "Your bid was accepted",
            f"You won '{order.title}'. Work starts once the client funds escrow.",
            Notification.Kind.BID,
            link=f"/orders/{order.pk}",
        )
        return Response(
            {
                "detail": "Bid accepted. Fund the order to start the work.",
                "order": OrderDetailSerializer(order, context={"request": request}).data,
                "quote": quote_order(order, bid.writer),
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        bid = self.get_object()
        if bid.order.client_id != request.user.id:
            return _bad_request("Only the client can reject a bid.")
        bid.status = BidStatus.REJECTED
        bid.save(update_fields=["status", "updated_at"])
        return Response({"detail": "Bid rejected."})

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        bid = self.get_object()
        if bid.writer_id != request.user.id:
            return _bad_request("You can only withdraw your own bid.")
        if bid.status == BidStatus.ACCEPTED:
            return _bad_request("An accepted bid cannot be withdrawn — contact support.")
        bid.status = BidStatus.WITHDRAWN
        bid.save(update_fields=["status", "updated_at"])
        return Response({"detail": "Bid withdrawn."})


class ReviewViewSet(viewsets.ModelViewSet):
    """Reviews, locked to completed orders the reviewer was actually party to."""

    serializer_class = ReviewSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["reviewee", "order", "rating"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Review.objects.select_related("reviewer", "reviewee", "order")

    def perform_create(self, serializer):
        order = serializer.validated_data["order"]
        reviewer = self.request.user
        reviewee = order.writer if reviewer.id == order.client_id else order.client
        review = serializer.save(reviewer=reviewer, reviewee=reviewee)
        self._recalculate_rating(reviewee)
        notify(
            reviewee,
            f"New {review.rating}-star review",
            f"{reviewer.display_name} reviewed you on '{order.title}'.",
            Notification.Kind.SYSTEM,
            link=f"/orders/{order.pk}",
        )

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        review = self.get_object()
        if review.reviewee_id != request.user.id:
            return _bad_request("Only the reviewed party can reply.")
        if review.reply:
            return _bad_request("You have already replied to this review.")
        text = (request.data.get("reply") or "").strip()
        if not text:
            return _bad_request("Reply cannot be empty.")
        review.reply = text
        review.replied_at = timezone.now()
        review.save(update_fields=["reply", "replied_at", "updated_at"])
        return Response(ReviewSerializer(review).data)

    @staticmethod
    def _recalculate_rating(user):
        from django.db.models import Avg

        stats = Review.objects.filter(reviewee=user).aggregate(avg=Avg("rating"), n=Count("id"))
        avg = round(stats["avg"] or 0, 2)
        count = stats["n"] or 0
        profile = getattr(user, "writer_profile", None) or getattr(user, "client_profile", None)
        if profile:
            profile.rating_avg = avg
            profile.rating_count = count
            profile.save(update_fields=["rating_avg", "rating_count", "updated_at"])
            if hasattr(profile, "recalculate_tier"):
                profile.recalculate_tier()


class HumanizationQuoteView(APIView):
    """Price a humanization job from an uploaded document before posting it."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = HumanizationQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        word_count = serializer.validated_data.get("word_count")
        uploaded = serializer.validated_data.get("file")
        parse_failed = False
        if uploaded:
            parsed = count_words_in_file(uploaded)
            if parsed:
                word_count = parsed
            elif not word_count:
                parse_failed = True

        if not word_count:
            return Response(
                {
                    "detail": "We couldn't read that file. Upload a .docx, .pdf or .txt, "
                    "or enter the word count manually.",
                    "parse_failed": parse_failed,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        price, pages = Order.calculate_humanization_price(word_count)
        from django.conf import settings as dj_settings

        return Response(
            {
                "word_count": word_count,
                "pages": pages,
                "price": str(price),
                "currency": "KES",
                "rate_per_page": dj_settings.HUMANIZATION_PRICE_PER_PAGE,
                "words_per_page": dj_settings.HUMANIZATION_WORDS_PER_PAGE,
            }
        )


class DashboardStatsView(APIView):
    """Role-aware numbers behind the dashboard stat cards."""

    def get(self, request):
        user = request.user
        wallet = getattr(user, "wallet", None)
        balance = str(wallet.balance) if wallet else "0.00"
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if user.is_writer:
            assigned = Order.objects.filter(writer=user)
            earned_month = (
                user.wallet.transactions.filter(
                    type="escrow_release", created_at__gte=month_start
                ).aggregate(t=Sum("amount"))["t"]
                if wallet
                else 0
            ) or 0
            profile = getattr(user, "writer_profile", None)
            return Response(
                {
                    "role": "writer",
                    "wallet_balance": balance,
                    "active_jobs": assigned.filter(status__in=ACTIVE_STATUSES).count(),
                    "awaiting_review": assigned.filter(status=OrderStatus.SUBMITTED).count(),
                    "in_revision": assigned.filter(status=OrderStatus.IN_REVISION).count(),
                    "completed_orders": assigned.filter(status=OrderStatus.COMPLETED).count(),
                    "open_orders_available": Order.objects.filter(
                        status=OrderStatus.OPEN_FOR_BIDS, is_public=True
                    ).exclude(bids__writer=user).count(),
                    "pending_bids": Bid.objects.filter(writer=user, status=BidStatus.PENDING).count(),
                    "earnings_this_month": str(earned_month),
                    "tier": profile.tier if profile else "new",
                    "rating_avg": str(profile.rating_avg) if profile else "0.00",
                    "on_time_rate": str(profile.on_time_rate) if profile else "100.00",
                    "strikes": profile.strikes if profile else 0,
                    "is_suspended": profile.is_suspended if profile else False,
                }
            )

        if user.is_admin_role:
            return Response({"role": "admin", "detail": "Use /api/admin/stats/."})

        own = Order.objects.filter(client=user)
        spent_month = (
            wallet.transactions.filter(type="escrow_fund", created_at__gte=month_start).aggregate(
                t=Sum("amount")
            )["t"]
            if wallet
            else 0
        ) or 0
        return Response(
            {
                "role": "client",
                "wallet_balance": balance,
                "active_orders": own.filter(status__in=ACTIVE_STATUSES).count(),
                "needs_action": own.filter(
                    status__in=[OrderStatus.SUBMITTED, OrderStatus.BID_ACCEPTED]
                ).count(),
                "open_for_bids": own.filter(status=OrderStatus.OPEN_FOR_BIDS).count(),
                "total_bids_received": Bid.objects.filter(
                    order__client=user, status=BidStatus.PENDING
                ).count(),
                "completed_orders": own.filter(status=OrderStatus.COMPLETED).count(),
                "spent_this_month": str(spent_month),
            }
        )


class AdminDisputeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = DisputeSerializer
    queryset = Dispute.objects.select_related("order", "raised_by", "resolved_by").all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "resolution"]

    @action(detail=True, methods=["post"], url_path="claim")
    def claim(self, request, pk=None):
        dispute = self.get_object()
        dispute.status = Dispute.Status.UNDER_REVIEW
        dispute.save(update_fields=["status", "updated_at"])
        return Response(DisputeSerializer(dispute).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def resolve(self, request, pk=None):
        dispute = self.get_object()
        if dispute.status == Dispute.Status.RESOLVED:
            return _bad_request("This dispute is already resolved.")

        serializer = DisputeResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = dispute.order

        try:
            if data["resolution"] == Dispute.Resolution.FULL_RELEASE:
                release_escrow(order, 100, actor=request.user)
                share = 100
            elif data["resolution"] == Dispute.Resolution.PARTIAL_RELEASE:
                share = data["writer_share_percent"]
                release_escrow(order, share, actor=request.user)
            else:
                refund_escrow(order, actor=request.user, note="Dispute resolved in client's favour")
                share = 0
        except EscrowError as exc:
            return _bad_request(str(exc))

        dispute.status = Dispute.Status.RESOLVED
        dispute.resolution = data["resolution"]
        dispute.writer_share_percent = share
        dispute.resolution_notes = data.get("resolution_notes", "")
        dispute.resolved_by = request.user
        dispute.resolved_at = timezone.now()
        dispute.save()

        profile = getattr(order.writer, "writer_profile", None) if order.writer else None
        if profile:
            profile.dispute_count += 1
            # Only a loss counts toward strikes — raising a dispute is not itself a fault.
            writer_lost = share < 100
            if writer_lost:
                profile.disputes_lost += 1
            profile.save(update_fields=["dispute_count", "disputes_lost", "updated_at"])
            if writer_lost and data.get("apply_strike"):
                profile.add_strike(f"Lost dispute on order #{order.pk}")

        for party in filter(None, [order.client, order.writer]):
            notify(
                party,
                "Dispute resolved",
                f"'{order.title}': {dispute.get_resolution_display()}.",
                Notification.Kind.DISPUTE,
                link=f"/orders/{order.pk}",
            )
        return Response(DisputeSerializer(dispute).data)


class AdminFineViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = FineSerializer
    queryset = Fine.objects.select_related("writer", "order").all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["reason", "is_waived", "writer"]

    @action(detail=True, methods=["post"])
    def waive(self, request, pk=None):
        fine = self.get_object()
        fine.is_waived = True
        fine.notes = (fine.notes + f" | Waived by {request.user.username}")[:255]
        fine.save(update_fields=["is_waived", "notes", "updated_at"])
        notify(
            fine.writer,
            "Fine waived",
            f"A KES {fine.amount} fine has been waived.",
            Notification.Kind.SYSTEM,
        )
        return Response(FineSerializer(fine).data)


class AdminFlaggedDeliverableViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = DeliverableSerializer
    queryset = Deliverable.objects.select_related("order", "writer").filter(flagged=True)

    @action(detail=True, methods=["post"], url_path="clear-flag")
    def clear_flag(self, request, pk=None):
        deliverable = self.get_object()
        deliverable.flagged = False
        deliverable.flag_reason = f"Cleared by {request.user.username}"
        deliverable.save(update_fields=["flagged", "flag_reason", "updated_at"])
        return Response(DeliverableSerializer(deliverable).data)

    @action(detail=True, methods=["post"], url_path="rescan")
    def rescan(self, request, pk=None):
        scan_deliverable.delay(int(pk))
        return Response({"detail": "Re-scan queued."})
