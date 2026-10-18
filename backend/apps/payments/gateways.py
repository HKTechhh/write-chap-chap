"""Payment gateway adapters.

Both providers are wired behind a common shape so the rest of the codebase
never branches on provider. When credentials are absent the adapters run in
**simulation mode**, which is what makes the whole marketplace demonstrable
end-to-end before Daraja/Flutterwave go live (Phase 1 of the roadmap).
"""
import base64
import logging
from datetime import datetime

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class GatewayError(Exception):
    """A provider call failed.

    ``definitive`` is True only when the provider clearly *refused* the request,
    so no money moved and it is safe to retry. A timeout or 5xx is ambiguous:
    the provider may have accepted it, so callers must not assume nothing was sent.
    """

    def __init__(self, message, definitive=False):
        super().__init__(message)
        self.definitive = definitive


# ------------------------------------------------------------------- M-Pesa


class MpesaGateway:
    name = "mpesa"

    @property
    def base_url(self):
        if settings.MPESA_ENVIRONMENT == "production":
            return "https://api.safaricom.co.ke"
        return "https://sandbox.safaricom.co.ke"

    @property
    def is_configured(self):
        return bool(
            settings.MPESA_CONSUMER_KEY
            and settings.MPESA_CONSUMER_SECRET
            and settings.MPESA_SHORTCODE
            and settings.MPESA_PASSKEY
        )

    def _access_token(self):
        response = requests.get(
            f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
            auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET),
            timeout=30,
        )
        response.raise_for_status()
        token = response.json().get("access_token")
        if not token:
            raise GatewayError("Daraja did not return an access token.")
        return token

    @staticmethod
    def normalize_phone(phone):
        """0712345678 / +254712345678 / 712345678 -> 254712345678."""
        digits = "".join(c for c in str(phone) if c.isdigit())
        if digits.startswith("254"):
            return digits
        if digits.startswith("0"):
            return "254" + digits[1:]
        if len(digits) == 9:
            return "254" + digits
        return digits

    def stk_push(self, *, phone, amount, reference, description="Penspan"):
        """Trigger an STK push. Returns a provider payload dict."""
        if not self.is_configured:
            return self._simulate(phone, amount, reference)

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}".encode()
        ).decode()

        payload = {
            "BusinessShortCode": settings.MPESA_SHORTCODE,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int(round(float(amount))),
            "PartyA": self.normalize_phone(phone),
            "PartyB": settings.MPESA_SHORTCODE,
            "PhoneNumber": self.normalize_phone(phone),
            "CallBackURL": settings.MPESA_CALLBACK_URL,
            "AccountReference": reference[:12],
            "TransactionDesc": description[:60],
        }
        try:
            response = requests.post(
                f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                json=payload,
                headers={"Authorization": f"Bearer {self._access_token()}"},
                timeout=45,
            )
            response.raise_for_status()
            return {"simulated": False, **response.json()}
        except requests.RequestException as exc:
            raise GatewayError(f"M-Pesa STK push failed: {exc}") from exc

    # ---- B2C (payouts)

    @property
    def is_b2c_configured(self):
        return bool(
            settings.MPESA_CONSUMER_KEY
            and settings.MPESA_CONSUMER_SECRET
            and (settings.MPESA_B2C_SHORTCODE or settings.MPESA_SHORTCODE)
            and settings.MPESA_INITIATOR_NAME
            and (
                settings.MPESA_SECURITY_CREDENTIAL
                or (settings.MPESA_INITIATOR_PASSWORD and settings.MPESA_CERT_PATH)
            )
        )

    @staticmethod
    def security_credential():
        """The initiator password encrypted with Safaricom's public certificate.

        Use MPESA_SECURITY_CREDENTIAL if you already generated it, otherwise set
        MPESA_INITIATOR_PASSWORD plus MPESA_CERT_PATH (the certificate downloaded
        from the Daraja portal for your environment).
        """
        if settings.MPESA_SECURITY_CREDENTIAL:
            return settings.MPESA_SECURITY_CREDENTIAL
        try:
            from cryptography import x509
            from cryptography.hazmat.primitives.asymmetric import padding

            with open(settings.MPESA_CERT_PATH, "rb") as handle:
                certificate = x509.load_pem_x509_certificate(handle.read())
            encrypted = certificate.public_key().encrypt(
                settings.MPESA_INITIATOR_PASSWORD.encode(), padding.PKCS1v15()
            )
        except (OSError, ValueError) as exc:
            raise GatewayError(f"Could not build the M-Pesa security credential: {exc}", definitive=True)
        return base64.b64encode(encrypted).decode()

    def b2c_payout(self, *, phone, amount, reference, remarks="Writer payout"):
        """Send money to a customer's M-Pesa. Returns the provider's acceptance payload.

        Acceptance only means Safaricom queued the request; the final outcome
        arrives later on the result URL. ``reference`` becomes the
        OriginatorConversationID, which Daraja echoes back so a result can be
        matched to a withdrawal and a retry cannot pay twice.
        """
        if not self.is_b2c_configured:
            if settings.DEBUG:
                return self._simulate(phone, amount, reference, kind="payout")
            raise GatewayError(
                "M-Pesa B2C is not configured (initiator name, security credential, shortcode).",
                definitive=True,
            )

        from .payouts import b2c_result_url, b2c_timeout_url

        payload = {
            "OriginatorConversationID": str(reference),
            "InitiatorName": settings.MPESA_INITIATOR_NAME,
            "SecurityCredential": self.security_credential(),
            "CommandID": "BusinessPayment",
            "Amount": int(amount),
            "PartyA": settings.MPESA_B2C_SHORTCODE or settings.MPESA_SHORTCODE,
            "PartyB": self.normalize_phone(phone),
            "Remarks": remarks[:100],
            "QueueTimeOutURL": b2c_timeout_url(),
            "ResultURL": b2c_result_url(),
            "Occasion": str(reference)[:100],
        }
        try:
            response = requests.post(
                f"{self.base_url}/mpesa/b2c/v3/paymentrequest",
                json=payload,
                headers={"Authorization": f"Bearer {self._access_token()}"},
                timeout=45,
            )
        except requests.RequestException as exc:
            # We may or may not have reached Safaricom: treat as uncertain.
            raise GatewayError(f"M-Pesa B2C request did not complete: {exc}") from exc

        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 500:
            raise GatewayError(f"M-Pesa B2C returned HTTP {response.status_code}.")
        if response.status_code >= 400 or str(body.get("ResponseCode", "")) != "0":
            reason = body.get("errorMessage") or body.get("ResponseDescription") or response.text[:200]
            raise GatewayError(f"M-Pesa refused the payout: {reason}", definitive=True)
        return {"simulated": False, **body}

    @staticmethod
    def _simulate(phone, amount, reference, kind="collection"):
        logger.info("M-Pesa simulation (%s): %s KES %s ref=%s", kind, phone, amount, reference)
        return {
            "simulated": True,
            "ResponseCode": "0",
            "ResponseDescription": "Simulated success — configure Daraja credentials to go live.",
            "CheckoutRequestID": f"SIM-{reference}",
            "MerchantRequestID": f"SIMM-{reference}",
        }


# -------------------------------------------------------------- Flutterwave


class FlutterwaveGateway:
    name = "flutterwave"
    base_url = "https://api.flutterwave.com/v3"

    @property
    def is_configured(self):
        return bool(settings.FLUTTERWAVE_SECRET_KEY)

    def create_payment_link(self, *, email, amount, reference, name="", currency="KES"):
        if not self.is_configured:
            logger.info("Flutterwave simulation: %s %s %s", email, currency, amount)
            return {
                "simulated": True,
                "status": "success",
                "link": f"{settings.FRONTEND_URL}/wallet?simulated_payment={reference}",
            }

        payload = {
            "tx_ref": reference,
            "amount": str(amount),
            "currency": currency,
            "redirect_url": f"{settings.FRONTEND_URL}/wallet",
            "customer": {"email": email, "name": name},
            "customizations": {
                "title": "Penspan",
                "description": "Wallet top-up",
            },
        }
        try:
            response = requests.post(
                f"{self.base_url}/payments",
                json=payload,
                headers={"Authorization": f"Bearer {settings.FLUTTERWAVE_SECRET_KEY}"},
                timeout=45,
            )
            response.raise_for_status()
            data = response.json()
            return {"simulated": False, "status": data.get("status"), "link": (data.get("data") or {}).get("link")}
        except requests.RequestException as exc:
            raise GatewayError(f"Flutterwave request failed: {exc}") from exc

    def verify(self, transaction_id):
        if not self.is_configured:
            return {"simulated": True, "status": "successful"}
        try:
            response = requests.get(
                f"{self.base_url}/transactions/{transaction_id}/verify",
                headers={"Authorization": f"Bearer {settings.FLUTTERWAVE_SECRET_KEY}"},
                timeout=30,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            raise GatewayError(f"Flutterwave verification failed: {exc}") from exc


mpesa = MpesaGateway()
flutterwave = FlutterwaveGateway()
