"""Thin GPTZero client.

Kept deliberately small and failure-tolerant: a screening outage must never
block a writer from delivering or a client from being paid out.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

MAX_CHARS = 50_000


class GPTZeroError(Exception):
    pass


def is_configured():
    return bool(settings.GPTZERO_API_KEY)


def scan_text(text):
    """Return {ai_content_score, plagiarism_score, report_url} as percentages.

    Raises GPTZeroError on transport/parse failure so the caller can record
    `scan_status=failed` rather than silently reporting a clean document.
    """
    if not is_configured():
        raise GPTZeroError("GPTZERO_API_KEY is not configured.")
    if not text or not text.strip():
        raise GPTZeroError("No extractable text in the submitted document.")

    payload = {"document": text[:MAX_CHARS], "multilingual": False}
    headers = {"x-api-key": settings.GPTZERO_API_KEY, "Content-Type": "application/json"}

    try:
        response = requests.post(
            settings.GPTZERO_API_URL, json=payload, headers=headers, timeout=60
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise GPTZeroError(f"GPTZero request failed: {exc}") from exc
    except ValueError as exc:
        raise GPTZeroError("GPTZero returned a non-JSON response.") from exc

    return _parse(data)


def _parse(data):
    documents = data.get("documents") or []
    if not documents:
        raise GPTZeroError("GPTZero response contained no document results.")
    doc = documents[0]

    ai_probability = (
        doc.get("completely_generated_prob")
        or (doc.get("class_probabilities") or {}).get("ai")
        or 0
    )
    ai_score = round(float(ai_probability) * 100, 2)

    # GPTZero's core endpoint is AI detection; plagiarism arrives only when the
    # account has the scan add-on enabled. Absent means "not measured", not zero.
    plagiarism = doc.get("plagiarism_score")
    plagiarism_score = round(float(plagiarism) * 100, 2) if plagiarism is not None else None

    return {
        "ai_content_score": ai_score,
        "plagiarism_score": plagiarism_score,
        "report_url": doc.get("scan_url") or data.get("scan_url") or "",
        "raw": data,
    }
