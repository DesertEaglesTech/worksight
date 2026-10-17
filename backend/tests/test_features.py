import json

import numpy as np
import pytest
from conftest import TestEncoder, create_profile, png, wait_job
from fastapi.testclient import TestClient
from test_api import inspect
from test_report import GOOD, FakeModel, reply, wait_failed
from worksight.api import create_app
from worksight.config import Settings
from worksight.detector import estimate_threshold, make_bank, per_image_for_cap
from worksight.service import InspectionService
from worksight.store import Store


def make_client(tmp_path, fake=None, **overrides):
    settings = Settings(
        data_dir=tmp_path,
        memory_per_image=16,
        min_validation_per_class=2,
        report_api_key="",
        report_models=("A", "B"),
        **overrides,
    )
    service = InspectionService(settings, TestEncoder, report_client=fake)
    return TestClient(create_app(settings, service))


def test_updating_an_old_record_does_not_make_it_newest(tmp_path):
    store = Store(tmp_path)
    store.put("x", {"id": "old", "created_at": "2026-10-01T00:00:00+00:00"})
    store.put("x", {"id": "new", "created_at": "2026-10-02T00:00:00+00:00"})
    store.put("x", {"id": "old", "created_at": "2026-10-01T00:00:00+00:00", "v": 2})
    assert [r["id"] for r in store.all("x")] == ["new", "old"]


def test_inspection_history_pages_and_filters(client):
    profile_id = create_profile(client)
    made = [inspect(client, profile_id, c) for c in [(240, 10, 10), (101, 100, 100)] * 3]
    url = f"/api/v1/profiles/{profile_id}/inspections"
    legacy = client.get(url).json()
    assert set(legacy) == {"items"} and len(legacy["items"]) == 6
    seen, cursor = [], None
    while True:
        page = client.get(url, params={"limit": 4, **({"cursor": cursor} if cursor else {})}).json()
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert sorted(seen) == sorted(i["id"] for i in made) and len(seen) == len(set(seen))
    assert seen == [i["id"] for i in legacy["items"]]
    anomalies = client.get(url, params={"decision": "anomaly"}).json()["items"]
    assert anomalies and all(i["decision"] == "anomaly" for i in anomalies)
    client.post(f"/api/v1/inspections/{anomalies[0]['id']}/feedback", json={"label": "normal"})
    reviewed = client.get(url, params={"human": "normal"}).json()["items"]
    # Human filter is separate from the model decision: this one stays "anomaly".
    assert [(i["id"], i["decision"], i["feedback_label"]) for i in reviewed] == [
        (anomalies[0]["id"], "anomaly", "normal")
    ]
    assert len(client.get(url, params={"human": "none"}).json()["items"]) == 5
    assert client.get(url, params={"since": "2999-01-01T00:00:00Z"}).json()["items"] == []
    assert client.get(url, params={"cursor": "%%%", "limit": 2}).status_code == 422
    assert client.get(url, params={"since": "2026-10-18T00:00:00"}).status_code == 422


def test_report_is_reused_keyed_and_limited(tmp_path):
    fake = FakeModel(*[reply(json.dumps(GOOD)) for _ in range(5)])
    with make_client(tmp_path, fake, report_hourly_limit=2) as client:
        profile_id = create_profile(client)
        first, second = (inspect(client, profile_id, (240, 10, 10)) for _ in range(2))
        url = f"/api/v1/inspections/{first['id']}/report"
        a = client.post(url, headers={"Idempotency-Key": "k1"}).json()
        wait_job(client, client.post(url, headers={"Idempotency-Key": "k1"}))
        again = client.post(url).json()
        assert again["job_id"] == a["job_id"] and again["reused"] is True
        assert len(fake.calls) == 1
        other = client.post(
            f"/api/v1/inspections/{second['id']}/report", headers={"Idempotency-Key": "k1"}
        )
        assert other.status_code == 409
        fresh = wait_job(client, client.post(url, params={"refresh": "true"}))
        assert fresh["report_id"] != a["resource_id"]
        assert client.get(url).json()["id"] == fresh["report_id"]
        limited = client.post(f"/api/v1/inspections/{second['id']}/report")
        assert limited.status_code == 429
        assert len(fake.calls) == 2


def test_documents_reach_the_report_prompt_only(tmp_path):
    answer = {**GOOD, "relevant_requirements": ["Pins must be straight", 7]}
    fake = FakeModel(reply(json.dumps(answer)))
    with make_client(tmp_path, fake) as client:
        profile_id = create_profile(client)
        url = f"/api/v1/profiles/{profile_id}/documents"
        spec = b"Connector pins must be straight within 0.1 mm.\n\nNo solder bridges."
        added = client.post(url, files={"file": ("spec.txt", spec, "text/plain")})
        assert added.status_code == 201 and "text" not in added.json()
        assert client.post(url, files={"file": ("spec.txt", spec, "text/plain")}).status_code == 409
        assert client.post(url, files={"file": ("a.docx", b"x", "application/x")}).status_code == 422
        assert client.post(url, files={"file": ("e.txt", b"  \n", "text/plain")}).status_code == 422
        assert [d["filename"] for d in client.get(url).json()["items"]] == ["spec.txt"]
        inspection = inspect(client, profile_id, (240, 10, 10))
        wait_job(client, client.post(f"/api/v1/inspections/{inspection['id']}/report"))
        report = client.get(f"/api/v1/inspections/{inspection['id']}/report").json()
        assert report["documents_used"] == [added.json()["id"]]
        assert report["relevant_requirements"] == ["Pins must be straight"]
        assert "within 0.1 mm" in fake.calls[0]["messages"][1]["content"][0]["text"]
        after = client.get(f"/api/v1/inspections/{inspection['id']}").json()
        assert after["decision"] == inspection["decision"]


def test_batch_inspects_each_image_and_ranks_by_score(client):
    profile_id = create_profile(client)
    files = [
        ("images", (f"part{i}.png", png(color), "image/png"))
        for i, color in enumerate([(101, 100, 100), (240, 10, 10), (102, 100, 100)])
    ]
    result = wait_job(client, client.post(f"/api/v1/profiles/{profile_id}/batches", files=files))
    batch = client.get(f"/api/v1/batches/{result['batch_id']}").json()
    assert batch["status"] == "ready" and batch["processed"] == batch["total"] == 3
    assert sum(batch["counts"].values()) == 3 and batch["counts"]["pending"] == 0
    scores = [i["anomaly_score"] for i in batch["items"]]
    assert scores == sorted(scores, reverse=True)
    assert batch["items"][0]["filename"] == "part1.png"
    one = client.get(f"/api/v1/inspections/{batch['items'][0]['inspection_id']}").json()
    assert one["batch_id"] == batch["id"] and one["status"] == "ready"
    assert client.get(f"/api/v1/profiles/{profile_id}/batches").json()["items"][0]["id"] == batch["id"]


def test_restart_fails_unfinished_records_with_a_reason(tmp_path):
    settings = Settings(data_dir=tmp_path, report_api_key="")
    store = Store(tmp_path)
    for kind in ("job", "inspection", "report", "batch"):
        store.put(kind, {"id": kind, "status": "running", "created_at": "2026-10-18T00:00:00+00:00"})
    InspectionService(settings, TestEncoder).close()
    for kind in ("job", "inspection", "report", "batch"):
        record = store.get(kind, kind)
        assert record["status"] == "failed" and "restarted" in record["error"]


def test_memory_cap_and_threshold_sample():
    features = [np.eye(8, dtype=np.float32) for _ in range(5)]
    assert per_image_for_cap(features, 100) is None
    assert per_image_for_cap(features, 20) == 4
    bank, owners = make_bank(features, per_image_for_cap(features, 20))
    assert len(bank) == 20 and np.bincount(owners).tolist() == [4] * 5
    many = [np.eye(4, dtype=np.float32)[[i % 4]] for i in range(40)]
    bank, owners = make_bank(many)
    assert estimate_threshold(many, bank, owners, sample=10)["scored_references"] == 10


def test_stats_validation_and_activation_history(client):
    profile_id = create_profile(client)
    base = f"/api/v1/profiles/{profile_id}"
    assert client.get(base + "/validation").status_code == 404
    bad = inspect(client, profile_id, (240, 10, 10))
    ok = inspect(client, profile_id, (101, 100, 100))
    client.post(f"/api/v1/inspections/{bad['id']}/feedback", json={"label": "anomaly"})
    client.post(f"/api/v1/inspections/{ok['id']}/feedback", json={"label": "normal"})
    stats = client.get(base + "/stats").json()
    assert stats["inspections"]["count"] == 2
    assert stats["onboarding"]["reference_count"] == 3
    agreement = stats["engineer_review"]["agreement"]
    assert agreement["compared"] == sum(
        i["decision"] != "review" for i in (bad, ok)
    ) and agreement["agree"] <= agreement["compared"]
    files = [("normal", (f"n{i}.png", png((90 + i, 95, 99)), "image/png")) for i in range(2)]
    files += [("anomaly", (f"a{i}.png", png((10, 200 + i, 10)), "image/png")) for i in range(2)]
    assert client.post(base + "/validation", files=files).status_code == 200
    validation = client.get(base + "/validation").json()
    assert validation["frozen"] and validation["counts"] == {"normal": 2, "anomaly": 2}
    version = client.get(base).json()["active_version_id"]
    assert client.get(base + "/activations").json()["items"] == []
    client.post(f"{base}/versions/{version}/activate")
    history = client.get(base + "/activations").json()["items"]
    assert history[0]["to_version_id"] == version and history[0]["activated_at"]
    assert history[0]["to_version_created_at"] <= history[0]["activated_at"]


def test_rate_limited_report_does_not_call_the_model(tmp_path):
    fake = FakeModel()
    with make_client(tmp_path, fake, report_daily_limit=0) as client:
        inspection = inspect(client, create_profile(client), (240, 10, 10))
        response = client.post(f"/api/v1/inspections/{inspection['id']}/report")
        assert response.status_code == 429 and fake.calls == []


@pytest.mark.parametrize("payload", [b"%PDF-1.4 broken", b""])
def test_bad_documents_are_rejected(client, payload):
    profile_id = create_profile(client)
    response = client.post(
        f"/api/v1/profiles/{profile_id}/documents",
        files={"file": ("x.pdf", payload, "application/pdf")},
    )
    assert response.status_code == 422


def test_failed_report_shows_reason(tmp_path):
    from worksight.report import ReportError

    fake = FakeModel(ReportError("Report service rejected the API key"))
    with make_client(tmp_path, fake) as client:
        inspection = inspect(client, create_profile(client), (240, 10, 10))
        job = wait_failed(client, client.post(f"/api/v1/inspections/{inspection['id']}/report"))
        assert job["error"] == "Report service rejected the API key"
