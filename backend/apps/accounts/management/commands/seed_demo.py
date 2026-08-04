"""Populate the database with a realistic demo dataset.

    python manage.py seed_demo

Idempotent: safe to re-run, it reuses accounts it already created.
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import ClientProfile, Role, User, WriterProfile
from apps.messaging.models import Conversation, Message
from apps.orders.models import Bid, BidStatus, Order, OrderStatus, OrderType, Review
from apps.orders.services import fund_order_from_wallet, release_escrow
from apps.payments.models import Wallet, WalletTransaction

PASSWORD = "Passw0rd!23"

WRITERS = [
    ("amina.w", "Amina", "Wanjiru", "Nursing & healthcare specialist, 6 years", ["nursing", "psychology"], 4.9, 42, "expert"),
    ("brian.o", "Brian", "Otieno", "Business, finance and case-study writer", ["business", "economics"], 4.7, 28, "expert"),
    ("cynthia.m", "Cynthia", "Mwende", "Law and policy research", ["law", "history"], 4.5, 14, "verified"),
    ("dennis.k", "Dennis", "Kiptoo", "IT, data science and technical documentation", ["it", "engineering"], 4.6, 19, "verified"),
    ("faith.n", "Faith", "Njeri", "Literature, essays and creative copy", ["literature", "marketing"], 4.3, 8, "verified"),
    ("george.m", "George", "Mutua", "Fresh graduate — economics and statistics", ["economics", "science"], 0, 0, "new"),
]

CLIENTS = [
    ("j.smith", "Julia", "Smith", "Brightpath Consulting"),
    ("m.ochieng", "Mark", "Ochieng", ""),
    ("s.hassan", "Sara", "Hassan", "Nairobi Med Group"),
]

ORDER_SEEDS = [
    ("Literature review on nurse burnout in county hospitals", "nursing",
     "Need a 2,500-word literature review covering burnout among nursing staff in Kenyan county hospitals. APA 7, minimum 15 peer-reviewed sources from the last 8 years.", 9500, 6),
    ("Business case study: market entry into East Africa", "business",
     "Analyse a mid-size SaaS company entering the Kenyan and Tanzanian markets. 3,000 words, Harvard referencing, include PESTLE and Porter's Five Forces.", 12000, 8),
    ("Contract law essay — doctrine of frustration", "law",
     "1,800-word essay on the doctrine of frustration in English contract law with reference to Kenyan case law. OSCOLA citations.", 7000, 4),
    ("Technical documentation for a REST API", "it",
     "Document 18 endpoints of an existing REST API. Needs request/response examples, error codes and an authentication guide. Roughly 4,000 words.", 15000, 10),
    ("Marketing copy for a fintech landing page", "marketing",
     "Punchy landing page copy for a savings app targeting 22-35 year olds in Nairobi. Hero, 3 feature blocks, FAQ, CTA. Tone: confident, warm, not corporate.", 6000, 3),
    ("Statistics assignment — regression analysis in R", "economics",
     "Multiple regression on a provided dataset, interpret coefficients, check assumptions, produce plots. Submit R script plus a 1,200-word write-up.", 8500, 5),
    ("Psychology research proposal on adolescent screen time", "psychology",
     "Research proposal, 2,000 words: background, research questions, methodology, ethics. APA 7.", 8000, 7),
    ("History essay: decolonisation in East Africa 1950-1970", "history",
     "2,200 words with primary source engagement. Chicago style footnotes.", 7500, 6),
]

CHAT_LINES = [
    ("writer", "Hi! I've read the brief — I've written extensively in this area. Starting on the outline today."),
    ("client", "Great. Please make sure the sources are from the last 8 years."),
    ("writer", "Noted. I'll prioritise 2018 onwards and flag anything older that's foundational."),
    ("client", "Perfect. Any questions on structure, just ask here."),
]


class Command(BaseCommand):
    help = "Seed the database with demo users, orders, bids, messages and reviews."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush-demo",
            action="store_true",
            help="Delete previously seeded demo orders before re-seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(42)

        admin = self._admin()
        writers = [self._writer(*w) for w in WRITERS]
        clients = [self._client(*c) for c in CLIENTS]

        if options["flush_demo"]:
            Order.objects.filter(client__in=clients).delete()
            self.stdout.write(self.style.WARNING("Cleared previous demo orders."))

        for wallet_user in clients:
            wallet = Wallet.objects.get(user=wallet_user)
            if wallet.balance < Decimal("50000"):
                wallet.credit(
                    Decimal("120000"), WalletTransaction.Type.TOPUP, description="Demo top-up"
                )

        created = self._orders(clients, writers)
        self._humanization_order(clients[0])
        self._check_request(clients[1])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write("")
        self.stdout.write("  Sign in with any of these (password for all: " + PASSWORD + ")")
        self.stdout.write(f"    admin   : admin")
        self.stdout.write(f"    client  : {CLIENTS[0][0]}")
        self.stdout.write(f"    writer  : {WRITERS[0][0]}")
        self.stdout.write("")
        self.stdout.write(f"  Orders in the system: {Order.objects.count()} ({created} new)")

    # ---------------------------------------------------------------- users
    def _admin(self):
        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@writechapchap.co.ke",
                "role": Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "first_name": "Platform",
                "last_name": "Admin",
                "is_verified": True,
                "kyc_status": "approved",
            },
        )
        if created:
            admin.set_password(PASSWORD)
            admin.save()
            self.stdout.write(self.style.SUCCESS("Created admin/" + PASSWORD))
        return admin

    def _writer(self, username, first, last, headline, subjects, rating, completed, tier):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": f"{username}@example.com",
                "role": Role.WRITER,
                "first_name": first,
                "last_name": last,
                "phone": f"2547{random.randint(10000000, 99999999)}",
                "is_verified": tier != "new",
                "kyc_status": "approved" if tier != "new" else "pending",
            },
        )
        if created:
            user.set_password(PASSWORD)
            user.save()

        profile, _ = WriterProfile.objects.get_or_create(user=user)
        profile.headline = headline
        profile.bio = (
            f"{headline}. I work to deadline, keep clients updated, and never submit "
            "AI-generated or plagiarised work. Every draft is written from scratch."
        )
        profile.subjects = subjects
        profile.skills = ["Research", "Academic writing", "Editing", "Referencing"]
        profile.languages = ["English", "Swahili"]
        profile.years_experience = max(1, completed // 8)
        profile.rating_avg = Decimal(str(rating))
        profile.rating_count = completed
        profile.completed_orders = completed
        profile.on_time_rate = Decimal(str(min(100, 85 + completed // 4)))
        profile.tier = tier
        profile.save()
        return user

    def _client(self, username, first, last, company):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": f"{username}@example.com",
                "role": Role.CLIENT,
                "first_name": first,
                "last_name": last,
                "phone": f"2547{random.randint(10000000, 99999999)}",
                "is_verified": True,
                "kyc_status": "approved",
            },
        )
        if created:
            user.set_password(PASSWORD)
            user.save()
        profile, _ = ClientProfile.objects.get_or_create(user=user)
        profile.company_name = company
        profile.save()
        return user

    # --------------------------------------------------------------- orders
    def _orders(self, clients, writers):
        created = 0
        now = timezone.now()

        for index, (title, subject, description, budget, days) in enumerate(ORDER_SEEDS):
            if Order.objects.filter(title=title).exists():
                continue

            client = clients[index % len(clients)]
            order = Order.objects.create(
                client=client,
                title=title,
                description=description,
                subject=subject,
                order_type=OrderType.WRITING,
                deadline=now + timedelta(days=days),
                budget=Decimal(budget),
                status=OrderStatus.OPEN_FOR_BIDS,
            )
            created += 1

            # A spread of bids from different writers.
            bidders = random.sample(writers, k=random.randint(2, 4))
            for writer in bidders:
                Bid.objects.create(
                    order=order,
                    writer=writer,
                    amount=Decimal(budget) * Decimal(random.choice(["0.85", "0.9", "1.0", "1.05"])),
                    delivery_time_hours=random.choice([24, 48, 72, 96]),
                    message=(
                        "I've handled several briefs like this one. I can deliver a "
                        "fully referenced draft well inside your deadline, and I'll "
                        "share an outline first so we're aligned before I write."
                    ),
                )

            # Push a few orders further down the lifecycle so the dashboards
            # aren't just a wall of "open for bids".
            if index in (0, 1, 2, 3):
                self._advance(order, bidders[0], index)

        return created

    def _advance(self, order, writer, index):
        bid = order.bids.filter(writer=writer).first()
        bid.status = BidStatus.ACCEPTED
        bid.save()
        order.bids.exclude(pk=bid.pk).update(status=BidStatus.REJECTED)
        order.writer = writer
        order.accepted_bid = bid
        order.budget = bid.amount
        order.status = OrderStatus.BID_ACCEPTED
        order.save()

        fund_order_from_wallet(order)
        self._chat(order)

        if index == 0:
            # A finished job with reviews on both sides.
            order.status = OrderStatus.SUBMITTED
            order.submitted_at = timezone.now()
            order.save()
            release_escrow(order)
            Review.objects.get_or_create(
                order=order,
                reviewer=order.client,
                defaults={
                    "reviewee": order.writer,
                    "rating": 5,
                    "comment": "Excellent work — delivered a day early, sources were exactly "
                    "what I asked for, and the structure was clean. Will hire again.",
                },
            )
            Review.objects.get_or_create(
                order=order,
                reviewer=order.writer,
                defaults={
                    "reviewee": order.client,
                    "rating": 5,
                    "comment": "Clear brief and quick to answer questions. A pleasure to work with.",
                },
            )
        elif index == 1:
            order.status = OrderStatus.SUBMITTED
            order.submitted_at = timezone.now()
            order.review_deadline = timezone.now() + timedelta(hours=72)
            order.save()
        elif index == 2:
            order.status = OrderStatus.IN_REVISION
            order.revision_count = 1
            order.save()

    def _chat(self, order):
        conversation, created = Conversation.objects.get_or_create(order=order)
        if created:
            conversation.participants.set([order.client, order.writer])
        if conversation.messages.exists():
            return
        for role, text in CHAT_LINES:
            sender = order.writer if role == "writer" else order.client
            Message.objects.create(
                conversation=conversation, order=order, sender=sender, content=text
            )
        conversation.last_message_at = timezone.now()
        conversation.save()

    def _humanization_order(self, client):
        title = "Humanize a 1,750-word draft chapter"
        if Order.objects.filter(title=title).exists():
            return
        order = Order(
            client=client,
            title=title,
            description="Rewrite the attached draft so it reads naturally, keeping every "
            "argument and citation intact. No meaning changes.",
            subject="literature",
            order_type=OrderType.HUMANIZATION,
            deadline=timezone.now() + timedelta(days=2),
            word_count=1750,
            status=OrderStatus.OPEN_FOR_BIDS,
        )
        order.apply_humanization_pricing()
        order.save()

    def _check_request(self, client):
        from apps.checks.models import CheckRequest

        if CheckRequest.objects.exists():
            return
        CheckRequest.objects.create(
            requested_by=client,
            contact_email=client.email,
            contact_name=client.display_name,
            document="check_requests/sample.txt",
            original_name="dissertation-chapter-3.docx",
            word_count=4200,
            report_types=["ai_content", "plagiarism"],
            notes="Need this before Friday's submission deadline please.",
        )
