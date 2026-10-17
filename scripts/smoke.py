"""Real pretrained encoder + API smoke test on synthetic fixtures, NOT a quality benchmark."""

import argparse
import io
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from worksight.api import create_app
from worksight.config import Settings


def fixture(i, defect=False):
    image = Image.new("RGB", (256, 192), (85 + i, 89 + i, 88 + i))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((32, 40, 224, 152), radius=12, fill=(165 + i, 165 + i, 160 + i))
    for x in (52, 204):
        for y in (60, 132):
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(40, 40, 40))
    if defect:
        draw.line((90, 72, 158, 116), fill=(15, 15, 15), width=7)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def await_job(client, response):
    response.raise_for_status()
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        job = client.get(response.json()["job_url"]).json()
        if job["status"] == "failed":
            raise RuntimeError(job["error"])
        if job["status"] == "succeeded":
            return job["result"]
        time.sleep(0.2)
    raise TimeoutError("Smoke job exceeded five minutes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("work/smoke"))
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--require-amd", action="store_true")
    args = parser.parse_args()
    settings = Settings(data_dir=args.data_dir, device=args.device, require_amd=args.require_amd)
    with TestClient(create_app(settings)) as client:
        files = [("images", (f"reference-{i}.png", fixture(i), "image/png")) for i in range(10)]
        profile = await_job(
            client,
            client.post(
                "/api/v1/profiles",
                data={"name": "Synthetic pipeline smoke — not industrial validation"},
                files=files,
            ),
        )
        results = []
        for name, defect in [("normal", False), ("scratch", True)]:
            job = await_job(
                client,
                client.post(
                    f"/api/v1/profiles/{profile['profile_id']}/inspections",
                    files={"image": (f"{name}.png", fixture(11, defect), "image/png")},
                ),
            )
            inspection = client.get(f"/api/v1/inspections/{job['inspection_id']}").json()
            assert client.get(inspection["overlay_url"]).status_code == 200
            results.append({"fixture": name, **inspection})
        report = {
            "purpose": "synthetic_pipeline_smoke_not_quality_benchmark",
            "profile": profile,
            "results": results,
        }
        (args.data_dir / "smoke-report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "purpose": report["purpose"],
                    "report": str(args.data_dir / "smoke-report.json"),
                    "runtime": client.get("/health").json()["runtime"],
                    "results": [
                        {
                            k: r[k]
                            for k in (
                                "fixture",
                                "anomaly_score",
                                "threshold",
                                "decision",
                                "inference_ms",
                            )
                        }
                        for r in results
                    ],
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
