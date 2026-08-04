from django.test import TestCase

from .leak_detection import LeakKind, Severity, scan


class ContactLeakDetectionTests(TestCase):
    """The detector has to catch obfuscation without shouting at normal chat."""

    def assertBlocked(self, text, kind=None):
        result = scan(text)
        self.assertTrue(
            result.should_block,
            f"Expected {text!r} to be blocked, got {result.kinds} / {result.severity}",
        )
        if kind:
            self.assertIn(kind.value, result.kinds)
        return result

    def assertClean(self, text):
        result = scan(text)
        self.assertTrue(
            result.is_clean, f"Expected {text!r} to be clean, got {result.kinds}"
        )
        return result

    # ------------------------------------------------------------- emails
    def test_plain_email_is_blocked(self):
        result = self.assertBlocked("Reach me at john.doe@gmail.com please", LeakKind.EMAIL)
        self.assertEqual(result.severity, Severity.HIGH)
        self.assertIn("[contact hidden]", result.masked_text)
        self.assertNotIn("john.doe@gmail.com", result.masked_text)

    def test_obfuscated_email_variants_are_blocked(self):
        for text in [
            "mail me at johndoe at gmail dot com",
            "johndoe (at) gmail (dot) com",
            "johndoe[at]yahoo[dot]com",
            "johndoe AT outlook DOT com",
        ]:
            with self.subTest(text=text):
                self.assertBlocked(text)

    # ------------------------------------------------------------- phones
    def test_kenyan_phone_formats_are_blocked(self):
        for text in [
            "call me on 0712345678",
            "my number is +254712345678",
            "reach 254 712 345 678",
            "0712 345 678 is my line",
            "+254-712-345-678",
            "0110123456",
            "whatsapp 0712.345.678",
        ]:
            with self.subTest(text=text):
                self.assertBlocked(text, LeakKind.PHONE)

    def test_spaced_out_digits_are_blocked(self):
        self.assertBlocked("here it is 0 7 1 2 3 4 5 6 7 8")

    def test_spelled_out_digits_are_blocked(self):
        self.assertBlocked(
            "my line is zero seven one two three four five six seven eight",
            LeakKind.PHONE_SPELLED,
        )

    def test_international_number_is_blocked(self):
        self.assertBlocked("ring +44 7911 123456")

    # ------------------------------------------------- links and handles
    def test_messaging_links_are_blocked(self):
        for text in [
            "join me https://wa.me/254712345678",
            "t.me/johndoe",
            "chat.whatsapp.com/ABCdef123",
        ]:
            with self.subTest(text=text):
                self.assertBlocked(text)

    def test_social_handle_is_blocked(self):
        self.assertBlocked("my telegram is johndoe_writer", LeakKind.SOCIAL_HANDLE)
        self.assertBlocked("ping me @johndoewriter", LeakKind.SOCIAL_HANDLE)

    def test_payment_details_are_blocked(self):
        self.assertBlocked("send it to paybill 400200 account 12345", LeakKind.PAYMENT_DETAIL)

    # ---------------------------------------------------- circumvention
    def test_circumvention_phrases_are_blocked(self):
        for text in [
            "let's discuss this outside the platform",
            "we can work directly and avoid the fee",
            "contact me on whatsapp instead",
            "give me your number so we can talk",
            "it will be cheaper if we skip the platform",
        ]:
            with self.subTest(text=text):
                self.assertBlocked(text)

    # ------------------------------------------------- false positives
    def test_ordinary_order_chat_is_not_blocked(self):
        for text in [
            "I'll deliver the 2000 word essay by Friday at 5pm.",
            "Please use APA 7th edition with at least 12 sources.",
            "The budget is KES 15000 for 10 pages.",
            "Can you add a section on chapter 3 methodology?",
            "Deadline is 2025-03-14, is that workable?",
            "I have completed 250 orders on similar topics.",
            "Reference number 100234 in the attached brief.",
            "Order #45 needs revision on pages 4 and 5.",
        ]:
            with self.subTest(text=text):
                self.assertClean(text)

    def test_word_counts_and_prices_are_not_phone_numbers(self):
        self.assertClean("The document is 12500 words and costs 2500 shillings.")

    def test_empty_message_is_clean(self):
        self.assertTrue(scan("").is_clean)
        self.assertTrue(scan(None).is_clean)

    # ---------------------------------------------------------- masking
    def test_masking_preserves_surrounding_text(self):
        result = scan("Hi, email me at a@b.com then call 0712345678 thanks")
        self.assertNotIn("a@b.com", result.masked_text)
        self.assertNotIn("0712345678", result.masked_text)
        self.assertIn("Hi, email me at", result.masked_text)
        self.assertIn("thanks", result.masked_text)

    def test_multiple_detections_are_all_reported(self):
        result = scan("mail j@k.com or call +254712345678 or telegram is jaykay")
        self.assertGreaterEqual(len(result.detections), 3)
        self.assertEqual(result.severity, Severity.HIGH)


class MessageModerationTests(TestCase):
    """End-to-end: a blocked message must never reach the database."""

    def setUp(self):
        from django.utils import timezone
        from datetime import timedelta

        from apps.accounts.models import Role, User
        from apps.orders.models import Order, OrderStatus

        self.client_user = User.objects.create_user(
            username="clientA", email="c@example.com", password="pw", role=Role.CLIENT
        )
        self.writer_user = User.objects.create_user(
            username="writerA", email="w@example.com", password="pw", role=Role.WRITER
        )
        self.order = Order.objects.create(
            client=self.client_user,
            writer=self.writer_user,
            title="Essay on marketing",
            description="1500 words",
            deadline=timezone.now() + timedelta(days=3),
            budget=5000,
            status=OrderStatus.IN_PROGRESS,
        )

    def test_clean_message_is_stored(self):
        from .models import Message
        from .services import moderate_and_send

        message, result = moderate_and_send(
            sender=self.writer_user, content="Draft is ready for review.", order=self.order
        )
        self.assertTrue(result.is_clean)
        self.assertEqual(Message.objects.count(), 1)
        self.assertFalse(message.was_masked)

    def test_blocked_message_is_not_stored_and_raises_flag(self):
        from .models import ContactLeakFlag, Message
        from .services import MessageBlocked, moderate_and_send

        with self.assertRaises(MessageBlocked):
            moderate_and_send(
                sender=self.writer_user,
                content="whatsapp me on 0712345678",
                order=self.order,
            )

        self.assertEqual(Message.objects.count(), 0)
        flag = ContactLeakFlag.objects.get()
        self.assertEqual(flag.user, self.writer_user)
        self.assertEqual(flag.action_taken, ContactLeakFlag.Action.BLOCKED)
        self.assertEqual(flag.severity, "high")
        # The original text is preserved for admin arbitration.
        self.assertIn("0712345678", flag.original_content)
        self.assertNotIn("0712345678", flag.masked_content)

    def test_repeat_offences_escalate_to_a_strike(self):
        from django.conf import settings

        from .services import MessageBlocked, moderate_and_send

        profile = self.writer_user.writer_profile
        for i in range(settings.CONTACT_LEAK_STRIKE_LIMIT):
            with self.assertRaises(MessageBlocked):
                moderate_and_send(
                    sender=self.writer_user,
                    content=f"call me on 07123456{i}{i}",
                    order=self.order,
                )

        profile.refresh_from_db()
        self.assertEqual(profile.contact_leak_strikes, settings.CONTACT_LEAK_STRIKE_LIMIT)
        self.assertEqual(profile.strikes, 1)

    def test_false_positive_review_reverses_the_strike(self):
        from apps.accounts.models import Role, User

        from .models import ContactLeakFlag
        from .services import MessageBlocked, moderate_and_send

        with self.assertRaises(MessageBlocked):
            moderate_and_send(
                sender=self.writer_user, content="my number is 0712345678", order=self.order
            )

        profile = self.writer_user.writer_profile
        profile.refresh_from_db()
        self.assertEqual(profile.contact_leak_strikes, 1)

        from rest_framework.test import APIClient

        admin = User.objects.create_user(
            username="adm", email="a@example.com", password="pw", role=Role.ADMIN, is_staff=True
        )
        api = APIClient()
        api.force_authenticate(user=admin)
        flag = ContactLeakFlag.objects.get()
        response = api.post(
            f"/api/admin/contact-leaks/{flag.pk}/review/",
            {"is_false_positive": True, "notes": "Quoting the client's own brief"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        profile.refresh_from_db()
        self.assertEqual(profile.contact_leak_strikes, 0)
