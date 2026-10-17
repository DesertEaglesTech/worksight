"""Part documentation: local text extraction only; nothing leaves the server here."""

import hashlib
import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 200
MAX_CHARS = 100_000


def extract(filename: str, content: bytes) -> dict:
    if not content or len(content) > MAX_BYTES:
        raise ValueError("Document is empty or exceeds the 10 MiB limit")
    name = (filename or "document").strip()[:200] or "document"
    if content.startswith(b"%PDF"):
        try:
            reader = PdfReader(io.BytesIO(content))
            pages = reader.pages[:MAX_PAGES]
            text = "\n".join((page.extract_text() or "").strip() for page in pages)
        except (PdfReadError, ValueError, KeyError, TypeError) as exc:
            raise ValueError("Could not read this PDF") from exc
        kind, page_count = "pdf", len(reader.pages)
    elif name.lower().endswith((".txt", ".md")):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Text documents must be UTF-8") from exc
        kind, page_count = "text", None
    else:
        raise ValueError("Only PDF, .txt and .md documents are supported")
    text = "\n".join(line.rstrip() for line in text.splitlines() if line.strip())
    if not text:
        raise ValueError("No extractable text (scanned PDFs need OCR, which is not supported)")
    return {
        "filename": name,
        "kind": kind,
        "pages": page_count,
        "sha256": hashlib.sha256(content).hexdigest(),
        "chars": min(len(text), MAX_CHARS),
        "truncated": len(text) > MAX_CHARS,
        "text": text[:MAX_CHARS],
    }


def context(documents: list[dict], budget: int) -> str | None:
    """Share the character budget across documents, newest first."""
    if not documents:
        return None
    share = max(500, budget // len(documents))
    parts, used = [], 0
    for doc in documents:
        excerpt = doc["text"][: min(share, budget - used)]
        if not excerpt:
            break
        parts.append(f"[{doc['filename']}]\n{excerpt}")
        used += len(excerpt)
    return "\n\n".join(parts)
