"""Off-platform contact detection for order chat.

Writers and clients taking a deal off-platform is the single biggest revenue
leak in a marketplace like this, and it also strips both parties of escrow
protection. This module scans outbound chat for contact details and
circumvention attempts before the message is ever stored.

Design notes:

* Detection is **span-based** — every hit records where it matched, so the
  message can be masked precisely rather than rejected wholesale.
* Severity drives policy. `HIGH` and `MEDIUM` hits block a message; `LOW`
  hits (soft signals like the word "whatsapp" on its own) only raise a flag,
  because blocking those would generate constant false positives on legitimate
  conversation ("I'll send the WhatsApp copy you asked about").
* Obfuscation is assumed. People write "zero seven one two", "name at gmail
  dot com", and "0 7 1 2 3 4 5 6 7 8" specifically to beat naive filters.

The module is pure and side-effect free so it can be unit-tested directly.
"""
import re
from dataclasses import dataclass, field
from enum import Enum

MASK = "[contact hidden]"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


_SEVERITY_ORDER = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3}


class LeakKind(str, Enum):
    EMAIL = "email"
    EMAIL_OBFUSCATED = "email_obfuscated"
    PHONE = "phone"
    PHONE_SPELLED = "phone_spelled"
    MESSAGING_LINK = "messaging_link"
    SOCIAL_HANDLE = "social_handle"
    PAYMENT_DETAIL = "payment_detail"
    EXTERNAL_URL = "external_url"
    CIRCUMVENTION = "circumvention"


@dataclass
class Detection:
    kind: LeakKind
    severity: Severity
    start: int
    end: int
    text: str

    def as_dict(self):
        return {
            "kind": self.kind.value,
            "severity": self.severity.value,
            "start": self.start,
            "end": self.end,
            "text": self.text,
        }


@dataclass
class ScanResult:
    detections: list = field(default_factory=list)
    masked_text: str = ""
    original_text: str = ""

    @property
    def is_clean(self):
        return not self.detections

    @property
    def severity(self):
        if not self.detections:
            return None
        return max(self.detections, key=lambda d: _SEVERITY_ORDER[d.severity]).severity

    @property
    def should_block(self):
        """Block on anything that is, or plausibly encodes, real contact info."""
        return self.severity in (Severity.MEDIUM, Severity.HIGH)

    @property
    def kinds(self):
        # dict.fromkeys keeps first-seen order while de-duplicating.
        return list(dict.fromkeys(d.kind.value for d in self.detections))

    def summary(self):
        labels = {
            LeakKind.EMAIL: "email address",
            LeakKind.EMAIL_OBFUSCATED: "disguised email address",
            LeakKind.PHONE: "phone number",
            LeakKind.PHONE_SPELLED: "spelled-out phone number",
            LeakKind.MESSAGING_LINK: "external messaging link",
            LeakKind.SOCIAL_HANDLE: "social media handle",
            LeakKind.PAYMENT_DETAIL: "off-platform payment detail",
            LeakKind.EXTERNAL_URL: "external contact link",
            LeakKind.CIRCUMVENTION: "attempt to move the deal off-platform",
        }
        seen = list(dict.fromkeys(labels[d.kind] for d in self.detections))
        return ", ".join(seen)

    def as_dict(self):
        return {
            "clean": self.is_clean,
            "severity": self.severity.value if self.severity else None,
            "blocked": self.should_block,
            "kinds": self.kinds,
            "summary": self.summary(),
            "detections": [d.as_dict() for d in self.detections],
            "masked_text": self.masked_text,
        }


# --------------------------------------------------------------------- regexes

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# "name at gmail dot com", "name (at) gmail [dot] com", "name AT gmail DOT com"
_AT = r"(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\bat\b|\bAT\b)"
_DOT = r"(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\bdot\b|\bDOT\b)"
EMAIL_OBFUSCATED_RE = re.compile(
    rf"\b[A-Za-z0-9._%+-]{{2,}}\s*{_AT}\s*[A-Za-z0-9-]{{2,}}\s*{_DOT}\s*(?:com|net|org|co\.?\s*ke|io|me|edu|info|gmail|yahoo|outlook)\b",
    re.IGNORECASE,
)

# Kenyan mobile: +254 7xx xxx xxx / 0 7xx xxx xxx / 01xx variants, any separators.
PHONE_KE_RE = re.compile(
    r"(?:(?<![\d\w])|\b)(?:\+?\s*254|0)[\s.\-()]*(?:7|1)[\s.\-()]*\d(?:[\s.\-()]*\d){7}(?!\d)"
)

# Generic international: +CC followed by 7-14 more digits with optional separators.
PHONE_INTL_RE = re.compile(r"\+\s*\d(?:[\s.\-()]*\d){7,14}(?!\d)")

# Bare long digit runs (no separators) — catches 0712345678 / 254712345678.
PHONE_BARE_RE = re.compile(r"(?<!\d)\d{9,15}(?!\d)")

# Digit runs broken up by separators, e.g. "0 7 1 2 3 4 5 6 7 8".
PHONE_SPACED_RE = re.compile(r"(?<![\d\w])[+\d][\d\s.\-()]{8,24}\d(?!\d)")

NUMBER_WORDS = {
    "zero": "0", "oh": "0", "o": "0", "nil": "0",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "sifuri": "0", "moja": "1", "mbili": "2", "tatu": "3", "nne": "4",
    "tano": "5", "sita": "6", "saba": "7", "nane": "8", "tisa": "9",
}
PHONE_SPELLED_RE = re.compile(
    r"\b(?:(?:" + "|".join(NUMBER_WORDS) + r")[\s,.\-]+){6,}(?:" + "|".join(NUMBER_WORDS) + r")\b",
    re.IGNORECASE,
)

MESSAGING_LINK_RE = re.compile(
    r"\b(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|join\.skype\.com|"
    r"m\.me|signal\.me|discord\.gg|meet\.google\.com|zoom\.us)/\S*",
    re.IGNORECASE,
)

SOCIAL_HANDLE_RE = re.compile(
    r"(?:\b(?:whatsapp|whats\s*app|wsp|telegram|tele\s*gram|skype|signal|instagram|insta|ig|"
    r"snapchat|snap|discord|facebook|fb|twitter|linkedin|wechat|viber|imo|botim)\b[^\n]{0,25}?)"
    r"(?:@[A-Za-z0-9._]{3,}|\b(?:is|:)\s*[A-Za-z0-9._]{4,})",
    re.IGNORECASE,
)

# Bare handles that read like a contact rather than a mention.
BARE_HANDLE_RE = re.compile(r"(?<![\w@/])@[A-Za-z0-9._]{4,30}\b")

PAYMENT_DETAIL_RE = re.compile(
    r"\b(?:paybill|pay\s*bill|till\s*(?:no|number)?|buy\s*goods|mpesa\s*(?:no|number|number is)?|"
    r"m-?pesa\s*(?:to|number)|send\s*(?:the\s*)?money\s*(?:to|directly)|account\s*(?:no|number)|"
    r"acc\s*no|iban|swift|bank\s*account|paypal|western\s*union|binance\s*id|usdt)\b"
    r"[^\n]{0,20}?\d{4,}",
    re.IGNORECASE,
)

EXTERNAL_URL_RE = re.compile(
    r"\b(?:https?://|www\.)[^\s]+\.(?:com|net|org|io|me|co|ke|info|xyz|link|site)\b\S*",
    re.IGNORECASE,
)

CIRCUMVENTION_RE = re.compile(
    r"\b(?:"
    r"outside\s+(?:of\s+)?(?:the\s+)?(?:platform|site|system|website)|"
    r"off[\s-]?(?:the[\s-]?)?platform|"
    r"(?:deal|work|pay|transact|talk|chat|continue)\s+(?:with\s+me\s+)?direct(?:ly)?|"
    r"avoid(?:ing)?\s+(?:the\s+)?(?:fee|commission|charges|platform)|"
    r"(?:skip|bypass|cut\s+out)\s+(?:the\s+)?(?:platform|site|middle\s*man|commission|fee)|"
    r"(?:contact|reach|text|call|dm|inbox|ping|hit)\s+me\s+(?:on|at|via|through)|"
    r"my\s+(?:number|no|digits|contact|line|email|mail|gmail)\s*(?:is|:)|"
    r"give\s+me\s+your\s+(?:number|contact|email|whatsapp)|"
    r"send\s+me\s+your\s+(?:number|contact|email|whatsapp)|"
    r"(?:let'?s|lets|we\s+can)\s+(?:talk|chat|discuss|continue)\s+(?:on|via)\s+"
    r"(?:whatsapp|telegram|email|skype|signal)|"
    r"cheaper\s+if\s+(?:we|you)\s+"
    r")",
    re.IGNORECASE,
)


# --------------------------------------------------------------------- helpers


def _digits(text):
    return re.sub(r"\D", "", text)


def _looks_like_phone(digits):
    """Shape test applied after separators are stripped.

    Deliberately conservative: it demands a real dialling prefix so that
    invoice numbers, word counts and ISO dates don't trip the filter.
    """
    if not digits:
        return False
    n = len(digits)
    if digits.startswith("254") and n == 12:
        return True
    if digits.startswith("2547") or digits.startswith("2541"):
        return 11 <= n <= 13
    if digits.startswith("07") or digits.startswith("01"):
        return n == 10
    if digits.startswith("7") or digits.startswith("1"):
        return n == 9
    # Other countries: a plausible international subscriber number.
    if 10 <= n <= 15 and not digits.startswith("0"):
        return True
    return False


def _add(detections, kind, severity, match, text=None):
    detections.append(
        Detection(
            kind=kind,
            severity=severity,
            start=match.start(),
            end=match.end(),
            text=text if text is not None else match.group(0),
        )
    )


def _overlaps(detections, start, end):
    return any(not (end <= d.start or start >= d.end) for d in detections)


# --------------------------------------------------------------------- scanner


def scan(text):
    """Scan a chat message for off-platform contact details.

    Returns a :class:`ScanResult`. Never raises on odd input.
    """
    result = ScanResult(original_text=text or "")
    if not text or not text.strip():
        result.masked_text = text or ""
        return result

    detections = []

    for match in EMAIL_RE.finditer(text):
        _add(detections, LeakKind.EMAIL, Severity.HIGH, match)

    for match in EMAIL_OBFUSCATED_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.EMAIL_OBFUSCATED, Severity.HIGH, match)

    for match in MESSAGING_LINK_RE.finditer(text):
        _add(detections, LeakKind.MESSAGING_LINK, Severity.HIGH, match)

    for match in PAYMENT_DETAIL_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.PAYMENT_DETAIL, Severity.HIGH, match)

    # Phone detection: run the specific patterns first, then the loose ones,
    # validating each candidate's digit shape before accepting it.
    for pattern in (PHONE_KE_RE, PHONE_INTL_RE, PHONE_BARE_RE, PHONE_SPACED_RE):
        for match in pattern.finditer(text):
            candidate = match.group(0).strip()
            if _overlaps(detections, match.start(), match.end()):
                continue
            if not _looks_like_phone(_digits(candidate)):
                continue
            _add(detections, LeakKind.PHONE, Severity.HIGH, match, candidate)

    for match in PHONE_SPELLED_RE.finditer(text):
        words = re.findall(r"[A-Za-z]+", match.group(0).lower())
        digits = "".join(NUMBER_WORDS.get(w, "") for w in words)
        if len(digits) >= 7 and not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.PHONE_SPELLED, Severity.HIGH, match)

    for match in SOCIAL_HANDLE_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.SOCIAL_HANDLE, Severity.MEDIUM, match)

    for match in BARE_HANDLE_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.SOCIAL_HANDLE, Severity.MEDIUM, match)

    for match in EXTERNAL_URL_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.EXTERNAL_URL, Severity.MEDIUM, match)

    for match in CIRCUMVENTION_RE.finditer(text):
        if not _overlaps(detections, match.start(), match.end()):
            _add(detections, LeakKind.CIRCUMVENTION, Severity.MEDIUM, match)

    detections.sort(key=lambda d: d.start)
    result.detections = detections
    result.masked_text = mask(text, detections)
    return result


def mask(text, detections):
    """Replace every detected span with the mask token."""
    if not detections:
        return text
    pieces = []
    cursor = 0
    for detection in sorted(detections, key=lambda d: d.start):
        if detection.start < cursor:
            continue  # already covered by an earlier span
        pieces.append(text[cursor : detection.start])
        pieces.append(MASK)
        cursor = detection.end
    pieces.append(text[cursor:])
    return "".join(pieces)
