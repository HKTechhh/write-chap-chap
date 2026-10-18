from decimal import Decimal
from unittest import mock

import requests
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role, User

from .gateways import GatewayError, MpesaGateway
from .models import Wallet, WalletTransaction, WithdrawalRequest
from .payouts import (
    callback_token,
    initiate_withdrawal_payout,
    note_queue_timeout,
    settle_b2c_result,
)

B2C = dict(
    DEBUG=False,
    MPESA_CONSUMER_KEY="key",
    MPESA_CONSUMER_SECRET="secret",
    MPESA_SHORTCODE="600000",
    MPESA_B2C_SHORTCODE="600111",
    MPESA_INITIATOR_NAME="testapi",
    MPESA_SECURITY_CREDENTIAL="ENCRYPTED==",
    MPESA_ENVIRONMENT="sandbox",
    FRONTEND_URL="https://penspan.com",
)


def fake_response(status=200, body=None):
    response = mock.Mock()
    response.status_code = status
    response.json.return_value = body if body is not None else {}
    response.text = str(body)
    return response


ACCEPTED = {
    "ConversationID": "AG_1",
    "OriginatorConversationID": "x",
    "ResponseCode": "0",
    "ResponseDescription": "Accept the service request successfully.",
}


def result_payload(withdrawal, code=0, desc="The service request is processed successfully."):
    return {
        "Result": {
            "ResultType": 0,
            "ResultCode": code,
            "ResultDesc": desc,
            "OriginatorConversationID": str(withdrawal.reference),
            "ConversationID": "AG_1",
            "TransactionID": "SGL1234ABC" if code == 0 else "",
            "ResultParameters": {
                "ResultParameter": [
                    {"Key": "TransactionAmount", "Value": int(withdrawal.net_amount)},
                    {"Key": "TransactionReceipt", "Value": "SGL1234ABC"},
                ]
            },
        }
    }


class PayoutBase(APITestCase):
    def setUp(self):
        self.writer = User.objects.create_user(
            username="amina", password="Passw0rd!23", role=Role.WRITER, kyc_status="approved",
            email="amina@example.com",
        )
        self.wallet, _ = Wallet.objects.get_or_create(user=self.writer)
        self.wallet.credit(5000, WalletTransaction.Type.PAYOUT, description="seed")

    def make_withdrawal(self, amount=1000, status=WithdrawalRequest.Status.PENDING):
        self.wallet.debit(amount, WalletTransaction.Type.WITHDRAWAL, description="Withdrawal request")
        return WithdrawalRequest.objects.create(
            user=self.writer, amount=amount, fee=50, net_amount=amount - 50,
            destination="254712345678", status=status,
        )

    def balance(self):
        self.wallet.refresh_from_db()
        return self.wallet.balance


@override_settings(**B2C)
class GatewayTests(PayoutBase):
    @mock.patch("apps.payments.gateways.requests.post")
    @mock.patch.object(MpesaGateway, "_access_token", return_value="tok")
    def test_payload_and_acceptance(self, _token, post):
        post.return_value = fake_response(200, ACCEPTED)
        result = MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="ref-1")

        self.assertFalse(result["simulated"])
        url = post.call_args.args[0]
        self.assertTrue(url.endswith("/mpesa/b2c/v3/paymentrequest"))
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["CommandID"], "BusinessPayment")
        self.assertEqual(body["Amount"], 950)
        self.assertEqual(body["PartyA"], "600111")
        self.assertEqual(body["PartyB"], "254712345678")
        self.assertEqual(body["OriginatorConversationID"], "ref-1")
        self.assertEqual(body["SecurityCredential"], "ENCRYPTED==")
        self.assertIn(callback_token(), body["ResultURL"])
        self.assertTrue(body["ResultURL"].startswith("https://penspan.com/api/payments/mpesa/b2c/result/"))

    @mock.patch("apps.payments.gateways.requests.post")
    @mock.patch.object(MpesaGateway, "_access_token", return_value="tok")
    def test_refusal_is_definitive_but_server_error_is_not(self, _token, post):
        post.return_value = fake_response(400, {"errorMessage": "Invalid Initiator"})
        with self.assertRaises(GatewayError) as refused:
            MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="r")
        self.assertTrue(refused.exception.definitive)

        post.return_value = fake_response(503, {})
        with self.assertRaises(GatewayError) as down:
            MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="r")
        self.assertFalse(down.exception.definitive)

        post.side_effect = requests.Timeout("slow")
        with self.assertRaises(GatewayError) as timeout:
            MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="r")
        self.assertFalse(timeout.exception.definitive)

    @override_settings(MPESA_INITIATOR_NAME="")
    def test_unconfigured_never_pretends_to_pay_in_production(self):
        with self.assertRaises(GatewayError) as ctx:
            MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="r")
        self.assertTrue(ctx.exception.definitive)

    @override_settings(MPESA_INITIATOR_NAME="", DEBUG=True)
    def test_unconfigured_simulates_in_development(self):
        result = MpesaGateway().b2c_payout(phone="0712345678", amount=Decimal("950"), reference="r")
        self.assertTrue(result["simulated"])


@override_settings(**B2C)
class PayoutLifecycleTests(PayoutBase):
    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", return_value={**ACCEPTED, "simulated": False})
    def test_accepted_then_paid_on_result(self, _payout):
        withdrawal = self.make_withdrawal()
        withdrawal = initiate_withdrawal_payout(withdrawal.pk)
        self.assertEqual(withdrawal.status, "processing")
        self.assertEqual(withdrawal.provider_reference, "AG_1")

        settle_b2c_result(result_payload(withdrawal))
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "paid")
        self.assertEqual(withdrawal.mpesa_receipt, "SGL1234ABC")
        self.assertEqual(self.balance(), Decimal("4000.00"))  # debited once, never refunded

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", return_value={**ACCEPTED, "simulated": False})
    def test_failed_result_refunds_exactly_once(self, _payout):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        self.assertEqual(self.balance(), Decimal("4000.00"))

        failure = result_payload(withdrawal, code=2001, desc="The initiator information is invalid.")
        settle_b2c_result(failure)
        settle_b2c_result(failure)  # Safaricom retries callbacks

        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "failed")
        self.assertEqual(self.balance(), Decimal("5000.00"))
        self.assertEqual(
            WalletTransaction.objects.filter(wallet=self.wallet, type=WalletTransaction.Type.REFUND).count(), 1
        )

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", return_value={**ACCEPTED, "simulated": False})
    def test_duplicate_success_callback_changes_nothing(self, _payout):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        success = result_payload(withdrawal)
        settle_b2c_result(success)
        settle_b2c_result(success)
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "paid")
        self.assertEqual(self.balance(), Decimal("4000.00"))

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", side_effect=GatewayError("refused", definitive=True))
    def test_definitive_refusal_returns_to_pending_for_retry(self, _payout):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        self.assertEqual(withdrawal.status, "pending")
        self.assertEqual(self.balance(), Decimal("4000.00"))  # still held, not refunded yet

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", side_effect=GatewayError("timeout"))
    def test_uncertain_outcome_stays_processing_and_is_not_refunded(self, _payout):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        self.assertEqual(withdrawal.status, "processing")
        self.assertIn("uncertain", withdrawal.result_desc)
        self.assertEqual(self.balance(), Decimal("4000.00"))

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout")
    def test_cannot_send_twice(self, payout):
        payout.return_value = {**ACCEPTED, "simulated": False}
        withdrawal = self.make_withdrawal()
        initiate_withdrawal_payout(withdrawal.pk)
        from .payouts import PayoutError

        with self.assertRaises(PayoutError):
            initiate_withdrawal_payout(withdrawal.pk)
        self.assertEqual(payout.call_count, 1)

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", return_value={**ACCEPTED, "simulated": False})
    def test_queue_timeout_only_flags(self, _payout):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        note_queue_timeout(result_payload(withdrawal, code=1))
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "processing")
        self.assertIn("timeout", withdrawal.result_desc)

    @override_settings(MPESA_INITIATOR_NAME="", DEBUG=True)
    def test_simulation_in_development_marks_paid(self):
        withdrawal = initiate_withdrawal_payout(self.make_withdrawal().pk)
        self.assertEqual(withdrawal.status, "paid")
        self.assertTrue(withdrawal.mpesa_receipt.startswith("SIM-"))


@override_settings(**B2C)
class PayoutApiTests(PayoutBase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="boss", password="Passw0rd!23", role=Role.ADMIN, is_staff=True
        )
        self.public = APIClient()

    def test_callback_rejects_a_wrong_token(self):
        withdrawal = self.make_withdrawal(status=WithdrawalRequest.Status.PROCESSING)
        response = self.public.post(
            "/api/payments/mpesa/b2c/result/not-the-token/", result_payload(withdrawal), format="json"
        )
        self.assertEqual(response.status_code, 404)
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "processing")

    def test_callback_with_the_token_settles(self):
        withdrawal = self.make_withdrawal(status=WithdrawalRequest.Status.PROCESSING)
        response = self.public.post(
            f"/api/payments/mpesa/b2c/result/{callback_token()}/", result_payload(withdrawal), format="json"
        )
        self.assertEqual(response.status_code, 200)
        withdrawal.refresh_from_db()
        self.assertEqual(withdrawal.status, "paid")

    def test_admin_cannot_mark_a_refunded_withdrawal_paid(self):
        withdrawal = self.make_withdrawal(status=WithdrawalRequest.Status.FAILED)
        admin = APIClient()
        admin.force_authenticate(self.admin)
        response = admin.post(f"/api/admin/withdrawals/{withdrawal.pk}/mark-paid/")
        self.assertEqual(response.status_code, 400)

    def test_rejecting_an_in_flight_payout_needs_confirmation(self):
        withdrawal = self.make_withdrawal(status=WithdrawalRequest.Status.PROCESSING)
        admin = APIClient()
        admin.force_authenticate(self.admin)
        url = f"/api/admin/withdrawals/{withdrawal.pk}/reject/"
        self.assertEqual(admin.post(url).status_code, 409)
        self.assertEqual(admin.post(url, {"confirm_not_sent": True}, format="json").status_code, 200)
        self.assertEqual(self.balance(), Decimal("5000.00"))

    @mock.patch("apps.payments.payouts.mpesa.b2c_payout", return_value={**ACCEPTED, "simulated": False})
    def test_admin_can_pay_via_mpesa(self, _payout):
        withdrawal = self.make_withdrawal()
        admin = APIClient()
        admin.force_authenticate(self.admin)
        response = admin.post(f"/api/admin/withdrawals/{withdrawal.pk}/pay-mpesa/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "processing")

    def test_withdrawal_validates_the_phone_and_whole_shillings(self):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=self.writer.pk))
        bad_phone = client.post(
            "/api/wallet/withdrawals/", {"amount": "1000", "destination": "12345"}, format="json"
        )
        self.assertEqual(bad_phone.status_code, 400)
        cents = client.post(
            "/api/wallet/withdrawals/", {"amount": "1000.50", "destination": "0712345678"}, format="json"
        )
        self.assertEqual(cents.status_code, 400)

    @override_settings(MPESA_B2C_ENABLED=True, MPESA_B2C_AUTO_LIMIT=20000)
    def test_small_withdrawals_are_sent_automatically_and_large_ones_wait(self):
        self.wallet.credit(50000, WalletTransaction.Type.PAYOUT, description="more")
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=self.writer.pk))  # fresh instance, no stale wallet cache

        with mock.patch("apps.payments.views.dispatch") as dispatch, self.captureOnCommitCallbacks(execute=True):
            small = client.post(
                "/api/wallet/withdrawals/", {"amount": "1000", "destination": "0712345678"}, format="json"
            )
        self.assertEqual(small.status_code, 201, small.data)
        self.assertEqual(small.data["destination"], "254712345678")
        self.assertEqual(dispatch.call_count, 1)

        with mock.patch("apps.payments.views.dispatch") as dispatch, self.captureOnCommitCallbacks(execute=True):
            large = client.post(
                "/api/wallet/withdrawals/", {"amount": "30000", "destination": "0712345678"}, format="json"
            )
        self.assertEqual(large.status_code, 201, large.data)
        self.assertEqual(dispatch.call_count, 0)
