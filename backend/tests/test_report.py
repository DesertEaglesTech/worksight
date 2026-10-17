import json
import time

import pytest
from conftest import TestEncoder, create_profile, wait_job
from fastapi.testclient import TestClient
from test_api import inspect
from worksight.api import create_app
from worksight.config import Settings
from worksight.report import ReportError, generate, parse_report
from worksight.service import InspectionService

GOOD = {
    "summary": "A dark mark is visible near the top-left corner.",
    "observations": ["Dark spot on the top-left pad, absent in the reference", 42],
    "heatmap_consistency": "consistent",
    "suggested_check": "Inspect the top-left pad under magnification.",
}


class FakeModel:
    """Records calls; each entry in `replies` is a dict response or an exception."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, model, messages, max_tokens):
        self.calls.append({"model": model, "messages": messages})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def reply(content, model="self-dploy/DeepSeek-V4.1-Flash"):
    return {
        "model": model,
        "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 500, "completion_tokens": 120, "total_tokens": 620},
    }


@pytest.fixture
def report_client(tmp_path):
    fake = FakeModel()
    settings = Settings(
        data_dir=tmp_path,
        memory_per_image=16,
        report_api_key="",
        report_models=("Gemma-4-31B-IT", "DeepSeek-V4.1-Flash"),
    )
    service = InspectionService(settings, TestEncoder, report_client=fake)
    with TestClient(create_app(settings, service)) as client:
        yield client, fake


def wait_failed(client, response):
    assert response.status_code == 202, response.text
    for _ in range(500):
        job = client.get(response.json()["job_url"]).json()
        if job["status"] in {"succeeded", "failed"}:
            assert job["status"] == "failed", job
            return job
        time.sleep(0.01)
    raise AssertionError("Job timed out")


def test_report_falls_back_and_never_changes_the_decision(report_client):
    client, fake = report_client
    fake.replies = [
        ReportError("Report model Gemma-4-31B-IT is unavailable (HTTP 500)", retryable=True),
        reply(json.dumps(GOOD)),
    ]
    inspection = inspect(client, create_profile(client), (240, 10, 10))
    url = f"/api/v1/inspections/{inspection['id']}/report"
    result = wait_job(client, client.post(url))
    report = client.get(url).json()
    assert report["id"] == result["report_id"]
    assert report["status"] == "ready"
    assert report["model"] == "DeepSeek-V4.1-Flash"
    assert report["failed_attempts"][0]["model"] == "Gemma-4-31B-IT"
    assert report["assistive_only"] is True
    assert report["model_decision"] == inspection["decision"]
    assert report["observations"] == [GOOD["observations"][0]]
    assert report["usage"]["total_tokens"] == 620
    assert client.get(f"/api/v1/reports/{report['id']}").json() == report
    # Three images (original, overlay, reference) and the detector's own result go to the model.
    content = fake.calls[-1]["messages"][1]["content"]
    assert [part["type"] for part in content] == ["text", "image_url", "image_url", "image_url"]
    assert f"decision={inspection['decision']}" in content[0]["text"]
    after = client.get(f"/api/v1/inspections/{inspection['id']}").json()
    assert after["decision"] == inspection["decision"]
    assert after["anomaly_score"] == inspection["anomaly_score"]


def test_rate_limit_stops_without_trying_other_models(report_client):
    client, fake = report_client
    fake.replies = [ReportError("Report service rate limit reached; try again in a minute")]
    inspection = inspect(client, create_profile(client), (240, 10, 10))
    url = f"/api/v1/inspections/{inspection['id']}/report"
    job = wait_failed(client, client.post(url))
    assert job["error"] == "Report service rate limit reached; try again in a minute"
    assert len(fake.calls) == 1
    report = client.get(url).json()
    assert report["status"] == "failed"
    assert report["error"] == job["error"]


def test_report_disabled_without_key(client):
    inspection = inspect(client, create_profile(client), (240, 10, 10))
    response = client.post(f"/api/v1/inspections/{inspection['id']}/report")
    assert response.status_code == 503
    assert client.get("/health").json()["report"]["enabled"] is False
    assert client.get(f"/api/v1/inspections/{inspection['id']}/report").status_code == 404


def test_parse_report_validates_and_bounds_output():
    parsed = parse_report("```json\n" + json.dumps({**GOOD, "heatmap_consistency": "maybe"}) + "\n```")
    assert parsed["heatmap_consistency"] == "unclear"
    assert parsed["observations"] == [GOOD["observations"][0]]
    for bad in [None, "", "not json", "[]", '{"observations": []}']:
        with pytest.raises(ReportError):
            parse_report(bad)


def test_generate_reports_every_failed_model():
    fake = FakeModel(
        ReportError("Report model A did not respond", retryable=True),
        reply("not json"),
    )
    with pytest.raises(ReportError, match="A: Report model A did not respond; B: .*malformed"):
        generate(fake, ("A", "B"), [], 100)


def test_server_error_retries_the_same_model_before_falling_back(monkeypatch):
    monkeypatch.setattr("worksight.report.sleep", lambda _s: None)
    fake = FakeModel(
        ReportError("Report model A is unavailable (HTTP 500)", retryable=True, server_error=True),
        reply(json.dumps(GOOD), model="self-dploy/A"),
    )
    result = generate(fake, ("A", "B"), [], 100)
    assert result["model"] == "A"
    assert [c["model"] for c in fake.calls] == ["A", "A"]
    assert result["failed_attempts"] == [
        {"model": "A", "error": "Report model A is unavailable (HTTP 500)"}
    ]


def test_timeout_moves_on_without_retrying_the_same_model(monkeypatch):
    monkeypatch.setattr("worksight.report.sleep", lambda _s: None)
    fake = FakeModel(
        ReportError("Report model A did not respond", retryable=True),
        reply(json.dumps(GOOD)),
    )
    assert generate(fake, ("A", "B"), [], 100)["model"] == "B"
    assert [c["model"] for c in fake.calls] == ["A", "B"]
