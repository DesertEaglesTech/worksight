import io
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from worksight.api import create_app
from worksight.config import Settings
from worksight.service import InspectionService


class TestEncoder:
    """Deliberately tiny deterministic test double, never used in the running application."""

    __test__ = False
    signature = "test-double-v1"
    device = "cpu"

    def extract(self, image):
        x = np.asarray(image.resize((4, 4)), dtype=np.float32).reshape(-1, 3) / 255
        x = np.concatenate([x, np.ones((len(x), 1), dtype=np.float32)], axis=1)
        return x / np.linalg.norm(x, axis=1, keepdims=True), (4, 4)

    def synchronize(self):
        pass

    def info(self):
        return {"device": "cpu", "amd_gpu": False, "encoder": self.signature, "test_double": True}


def png(color, size=(32, 24)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def wait_job(client, response):
    assert response.status_code == 202, response.text
    for _ in range(500):
        job = client.get(response.json()["job_url"]).json()
        if job["status"] in {"succeeded", "failed"}:
            assert job["status"] == "succeeded", job
            return job["result"]
        time.sleep(0.01)
    raise AssertionError("Job timed out")


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        data_dir=tmp_path, memory_per_image=16, min_validation_per_class=2, report_api_key=""
    )
    service = InspectionService(settings, TestEncoder)
    with TestClient(create_app(settings, service)) as client:
        yield client


def create_profile(client):
    files = [
        ("images", (f"normal{i}.png", png((100 + i, 100, 100)), "image/png")) for i in range(3)
    ]
    return wait_job(
        client, client.post("/api/v1/profiles", data={"name": "Test part"}, files=files)
    )["profile_id"]
