"""Document parsing helpers — used to auto-price humanization orders."""
import io
import re

TEXT_EXTENSIONS = {".txt", ".md", ".rtf", ".csv"}


def _count_words(text):
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def extract_text(uploaded_file):
    """Best-effort text extraction from docx / pdf / plain text.

    Returns "" rather than raising, so a parse failure never blocks an upload —
    the caller falls back to a manual word count.
    """
    name = (getattr(uploaded_file, "name", "") or "").lower()
    try:
        uploaded_file.seek(0)
        raw = uploaded_file.read()
    except Exception:
        return ""
    finally:
        try:
            uploaded_file.seek(0)
        except Exception:
            pass

    if name.endswith(".docx"):
        return _extract_docx(raw)
    if name.endswith(".pdf"):
        return _extract_pdf(raw)
    if any(name.endswith(ext) for ext in TEXT_EXTENSIONS):
        return raw.decode("utf-8", errors="ignore")
    # Unknown type: try utf-8 and give up quietly if it's binary.
    decoded = raw.decode("utf-8", errors="ignore")
    return decoded if decoded.count("�") < len(decoded) * 0.1 else ""


def _extract_docx(raw):
    try:
        import docx

        document = docx.Document(io.BytesIO(raw))
        parts = [p.text for p in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                parts.extend(cell.text for cell in row.cells)
        return "\n".join(parts)
    except Exception:
        return ""


def _extract_pdf(raw):
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def count_words_in_file(uploaded_file):
    """Word count for an uploaded document, or None if it couldn't be parsed."""
    text = extract_text(uploaded_file)
    if not text.strip():
        return None
    return _count_words(text)
