"""Assistive inspection report from a vision-language model on AMD Token Factory.

The report describes what the detector already decided; it never changes the decision, score or
threshold. Images leave this server only when a report is explicitly requested.
"""

import base64
import io
import json
import urllib.error
import urllib.request
from time import perf_counter, sleep

from PIL import Image

PROVIDER = "AMD Token Factory"
CONSISTENCY = {"consistent", "partly_consistent", "inconsistent", "unclear"}
SYSTEM = (
    "You assist a quality engineer reviewing an automated visual inspection. "
    "Describe only what is visible. Do not decide pass or fail, do not estimate probabilities, "
    "dimensions or causes you cannot see, and say so when nothing is visibly different. "
    "Reply with a single JSON object and nothing else."
)


class ReportError(Exception):
    """Operator-safe failure; the message is shown to users."""

    def __init__(self, message, retryable=False, server_error=False):
        super().__init__(message)
        self.retryable = retryable
        # Token Factory 5xx (e.g. a provider-side out-of-memory) is often gone seconds later.
        self.server_error = server_error


class TokenFactoryClient:
    """Minimal OpenAI-compatible chat client using only the standard library."""

    def __init__(self, base_url: str, api_key: str, timeout: float):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.api_key = api_key
        self.timeout = timeout

    def complete(self, model: str, messages: list, max_tokens: int) -> dict:
        body = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise ReportError("Report service rejected the API key") from exc
            if exc.code == 429:
                raise ReportError("Report service rate limit reached; try again in a minute") from exc
            raise ReportError(
                f"Report model {model} is unavailable (HTTP {exc.code})",
                retryable=exc.code >= 500,
                server_error=exc.code >= 500,
            ) from exc
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            raise ReportError(f"Report model {model} did not respond", retryable=True) from exc


def data_url(image: Image.Image, side: int) -> str:
    image = image.copy()
    image.thumbnail((side, side))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def build_messages(
    inspection: dict, original, overlay, reference, side: int, documents: str | None = None
) -> list:
    task = (
        f"Detector result (authoritative, do not change it): decision={inspection['decision']}, "
        f"anomaly_score={inspection['anomaly_score']:.4f}, threshold={inspection['threshold']:.4f}. "
        "The score is a heuristic distance, not a probability.\n"
        "Image 1: part under inspection. Image 2: the same part with a heatmap overlay; warmer "
        "colours mark regions least similar to the known-good references. Image 3: the most "
        "similar known-good reference.\n"
        "The reference may be rotated, shifted or lit differently; that is not a defect. "
        "Look at the components inside the highlighted regions of image 2 (pins, leads, "
        "solder, labels, surface) and compare their condition with the same components in "
        "image 3. Return JSON: "
        '{"summary": "one or two sentences", '
        '"observations": ["short visible difference with its location"], '
        '"heatmap_consistency": "consistent | partly_consistent | inconsistent | unclear", '
        '"suggested_check": "what the engineer should look at first", '
        '"relevant_requirements": ["requirement from the documentation that applies, quoted briefly"]}'
    )
    if documents:
        task += (
            "\nPart documentation provided by the engineer (may be incomplete). Use it to name "
            "which requirements the visible differences touch. Do not invent tolerances it does "
            "not state; return an empty relevant_requirements list if none apply.\n"
            f"<documentation>\n{documents}\n</documentation>"
        )
    return [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": task},
                *(
                    {"type": "image_url", "image_url": {"url": data_url(image, side)}}
                    for image in (original, overlay, reference)
                ),
            ],
        },
    ]


def parse_report(content: str | None) -> dict:
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ReportError("Report model returned malformed output", retryable=True) from exc
    if not isinstance(data, dict) or not isinstance(data.get("summary"), str):
        raise ReportError("Report model returned an incomplete report", retryable=True)
    observations = data.get("observations")
    consistency = data.get("heatmap_consistency")
    suggested = data.get("suggested_check")
    requirements = data.get("relevant_requirements")
    return {
        "summary": data["summary"].strip()[:600],
        "observations": [
            o.strip()[:300] for o in (observations if isinstance(observations, list) else [])
            if isinstance(o, str) and o.strip()
        ][:8],
        "heatmap_consistency": consistency if consistency in CONSISTENCY else "unclear",
        "suggested_check": suggested.strip()[:300] if isinstance(suggested, str) else None,
        "relevant_requirements": [
            r.strip()[:300] for r in (requirements if isinstance(requirements, list) else [])
            if isinstance(r, str) and r.strip()
        ][:5],
    }


def generate(
    client,
    models: tuple[str, ...],
    messages: list,
    max_tokens: int,
    server_error_retries: int = 2,
    retry_delay_s: float = 3.0,
) -> dict:
    """Try models in order. Server errors are retried on the same model with growing pauses
    (Gemma on Token Factory fails in short bursts); timeouts and malformed output move
    straight to the next model."""
    attempts = []
    queue = [(model, server_error_retries) for model in models]
    while queue:
        model, retries_left = queue.pop(0)
        start = perf_counter()
        try:
            response = client.complete(model, messages, max_tokens)
            choice = response["choices"][0]
            report = parse_report(choice["message"].get("content"))
        except ReportError as exc:
            attempts.append({"model": model, "error": str(exc)})
            if exc.server_error and retries_left > 0:
                sleep(retry_delay_s * (server_error_retries - retries_left + 1))
                queue.insert(0, (model, retries_left - 1))
                continue
            if exc.retryable:
                continue
            raise
        except (KeyError, IndexError, TypeError):
            attempts.append({"model": model, "error": "Unexpected response shape"})
            continue
        usage = response.get("usage") or {}
        return {
            **report,
            "model": model,
            "served_model": response.get("model"),
            "provider": PROVIDER,
            "latency_ms": round((perf_counter() - start) * 1000, 1),
            "usage": {
                k: usage.get(k) for k in ("prompt_tokens", "completion_tokens", "total_tokens")
            },
            "finish_reason": choice.get("finish_reason"),
            "failed_attempts": attempts,
        }
    raise ReportError(
        "No report model is available right now: "
        + "; ".join(f"{a['model']}: {a['error']}" for a in attempts)
    )
