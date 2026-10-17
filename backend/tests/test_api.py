from conftest import TestEncoder, create_profile, png, wait_job
from fastapi.testclient import TestClient
from worksight.api import create_app
from worksight.config import Settings
from worksight.service import InspectionService


def inspect(client, profile_id, color):
    result = wait_job(
        client,
        client.post(
            f"/api/v1/profiles/{profile_id}/inspections",
            files={"image": ("test.png", png(color), "image/png")},
        ),
    )
    return client.get(f"/api/v1/inspections/{result['inspection_id']}").json()


def test_profile_inspection_assets_and_persistence(client):
    profile_id = create_profile(client)
    result = inspect(client, profile_id, (240, 10, 10))
    assert result["decision"] == "anomaly"
    assert result["runtime"]["amd_gpu"] is False
    assert result["threshold_status"] == "heuristic_not_probability"
    for key in ["image_url", "heatmap_url", "overlay_url", "reference_url"]:
        response = client.get(result[key])
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
    settings = client.app.state.service.settings
    with TestClient(create_app(settings, InspectionService(settings, TestEncoder))) as reopened:
        assert reopened.get(f"/api/v1/profiles/{profile_id}").json()["status"] == "ready"
        assert (
            inspect(reopened, profile_id, (240, 10, 10))["anomaly_score"] == result["anomaly_score"]
        )


def test_candidate_is_not_automatically_active_and_rejects_defect(client):
    profile_id = create_profile(client)
    profile_url = f"/api/v1/profiles/{profile_id}"
    original = client.get(profile_url).json()["active_version_id"]
    result = inspect(client, profile_id, (110, 100, 100))
    feedback = client.post(
        f"/api/v1/inspections/{result['id']}/feedback", json={"label": "normal"}
    ).json()
    candidate = wait_job(
        client, client.post(f"{profile_url}/candidates", json={"feedback_ids": [feedback["id"]]})
    )
    version_url = f"{profile_url}/versions/{candidate['version_id']}"
    assert client.get(profile_url).json()["active_version_id"] == original
    assert client.post(version_url + "/activate").status_code == 409
    assert client.post(version_url + "/evaluate").status_code == 409
    anomaly = inspect(client, profile_id, (240, 0, 0))
    bad = client.post(
        f"/api/v1/inspections/{anomaly['id']}/feedback", json={"label": "anomaly"}
    ).json()
    assert (
        client.post(f"{profile_url}/candidates", json={"feedback_ids": [bad["id"]]}).status_code
        == 422
    )


def test_validate_activate_and_rollback(client):
    profile_id = create_profile(client)
    url = f"/api/v1/profiles/{profile_id}"
    original = client.get(url).json()["active_version_id"]
    files = [("normal", (f"n{i}.png", png((103 + i, 100, 100)), "image/png")) for i in range(2)]
    files += [("anomaly", (f"a{i}.png", png((240, i, 0)), "image/png")) for i in range(2)]
    assert client.post(url + "/validation", files=files).status_code == 200
    assert client.post(url + "/validation", files=files).status_code == 409
    result = inspect(client, profile_id, (105, 100, 100))
    feedback = client.post(
        f"/api/v1/inspections/{result['id']}/feedback", json={"label": "normal"}
    ).json()
    candidate = wait_job(
        client, client.post(url + "/candidates", json={"feedback_ids": [feedback["id"]]})
    )
    version_url = url + f"/versions/{candidate['version_id']}"
    evaluation = wait_job(client, client.post(version_url + "/evaluate"))
    assert evaluation["gate"]["passed"]
    assert client.post(version_url + "/activate").status_code == 200
    assert client.get(url).json()["active_version_id"] == candidate["version_id"]
    assert client.post(url + f"/versions/{original}/activate").status_code == 200
    assert client.get(url).json()["active_version_id"] == original


def test_validation_leakage_and_duplicate_inputs(client):
    profile_id = create_profile(client)
    files = [
        ("normal", ("n.png", png((100, 100, 100)), "image/png")),
        ("normal", ("n2.png", png((104, 100, 100)), "image/png")),
        ("anomaly", ("a.png", png((240, 0, 0)), "image/png")),
        ("anomaly", ("a2.png", png((241, 0, 0)), "image/png")),
    ]
    assert client.post(f"/api/v1/profiles/{profile_id}/validation", files=files).status_code == 422
    duplicates = [("images", (f"n{i}.png", png((100, 100, 100)), "image/png")) for i in range(3)]
    assert (
        client.post("/api/v1/profiles", data={"name": "Duplicate"}, files=duplicates).status_code
        == 422
    )
    response = client.post(
        f"/api/v1/profiles/{profile_id}/inspections",
        files={"image": ("x.png", b"not an image", "image/png")},
    )
    assert response.status_code == 422
    assert client.get("/api/v1/assets/worksight.sqlite3").status_code == 404


def test_authentication_includes_images(tmp_path):
    settings = Settings(data_dir=tmp_path, api_key="test-secret")
    with TestClient(create_app(settings, InspectionService(settings, TestEncoder))) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/v1/profiles").status_code == 401
        assert client.get("/api/v1/assets/" + "a" * 64 + ".png").status_code == 401
        assert (
            client.get(
                "/api/v1/profiles", headers={"Authorization": "Bearer test-secret"}
            ).status_code
            == 200
        )


def test_job_failure_is_visible_and_does_not_fake_results(tmp_path):
    settings = Settings(data_dir=tmp_path)

    def broken_encoder():
        raise RuntimeError("GPU unavailable")

    service = InspectionService(settings, broken_encoder)
    # Run synchronously after submission by waiting for the worker to finish.
    images = [service.save_upload(png((i, 0, 0))) for i in range(3)]
    job = service.create_profile("Broken", images)
    service.close()
    assert service.store.get("job", job["job_id"])["status"] == "failed"
    profile = service.store.get("profile", job["resource_id"])
    assert profile["status"] == "failed"
    assert profile["active_version_id"] is None


def test_regression_cannot_be_activated(client):
    profile_id = create_profile(client)
    url = f"/api/v1/profiles/{profile_id}"
    original = client.get(url).json()["active_version_id"]
    files = [("normal", (f"n{i}.png", png((103 + i, 100, 100)), "image/png")) for i in range(2)]
    files += [("anomaly", (f"a{i}.png", png((240, i, 0)), "image/png")) for i in range(2)]
    assert client.post(url + "/validation", files=files).status_code == 200
    # A human mistakenly calls a defect normal. Validation must catch the new false negatives.
    result = inspect(client, profile_id, (239, 0, 0))
    feedback = client.post(
        f"/api/v1/inspections/{result['id']}/feedback", json={"label": "normal"}
    ).json()
    candidate = wait_job(
        client, client.post(url + "/candidates", json={"feedback_ids": [feedback["id"]]})
    )
    version_url = url + f"/versions/{candidate['version_id']}"
    evaluation = wait_job(client, client.post(version_url + "/evaluate"))
    assert not evaluation["gate"]["passed"]
    assert client.post(version_url + "/activate").status_code == 409
    assert client.get(url).json()["active_version_id"] == original


def test_validation_image_cannot_be_added_via_feedback(client):
    profile_id = create_profile(client)
    url = f"/api/v1/profiles/{profile_id}"
    files = [("normal", (f"n{i}.png", png((103 + i, 100, 100)), "image/png")) for i in range(2)]
    files += [("anomaly", (f"a{i}.png", png((240, i, 0)), "image/png")) for i in range(2)]
    assert client.post(url + "/validation", files=files).status_code == 200
    result = inspect(client, profile_id, (103, 100, 100))
    feedback = client.post(
        f"/api/v1/inspections/{result['id']}/feedback", json={"label": "normal"}
    ).json()
    response = client.post(url + "/candidates", json={"feedback_ids": [feedback["id"]]})
    assert response.status_code == 422


def test_restart_marks_interrupted_tasks_failed(tmp_path):
    from worksight.store import Store

    store = Store(tmp_path)
    store.put("profile", {"id": "interrupted", "status": "running", "active_version_id": None})
    store.put(
        "job",
        {
            "id": "job",
            "status": "running",
            "resource_kind": "profile",
            "resource_id": "interrupted",
        },
    )
    service = InspectionService(Settings(data_dir=tmp_path), TestEncoder)
    try:
        assert service.store.get("job", "job")["status"] == "failed"
        assert service.store.get("profile", "interrupted")["status"] == "failed"
    finally:
        service.close()


def test_archived_profile_leaves_list_but_stays_readable(client):
    profile_id = create_profile(client)
    result = inspect(client, profile_id, (240, 10, 10))
    archived = client.post(f"/api/v1/profiles/{profile_id}/archive").json()
    assert archived["archived_at"]
    assert client.post(f"/api/v1/profiles/{profile_id}/archive").json() == archived
    assert profile_id not in [p["id"] for p in client.get("/api/v1/profiles").json()["items"]]
    assert client.get(f"/api/v1/profiles/{profile_id}").status_code == 200
    assert client.get(f"/api/v1/inspections/{result['id']}").status_code == 200
    assert client.post("/api/v1/profiles/missing/archive").status_code == 404
