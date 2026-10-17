"""Offline evaluation on a manifest; thresholds are never selected on the test set."""

import argparse
import hashlib
import json
from pathlib import Path
from time import perf_counter

import numpy as np
from PIL import Image, ImageOps

from .detector import distances, estimate_threshold, image_score, make_bank
from .encoder import VisualEncoder
from .evaluation import metrics
from .store import now


def read_image(path: Path):
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    digest = hashlib.sha256(f"{image.size}".encode() + image.tobytes()).hexdigest()
    return image, digest


def run_benchmark(manifest_path: Path, device="auto", require_amd=False):
    manifest = json.loads(manifest_path.read_text())
    base = manifest_path.resolve().parent
    references = manifest["references"]
    tests = manifest["test"]
    if not 3 <= len(references) <= 50 or not tests:
        raise ValueError("Provide 3–50 references and a nonempty test set")
    if {item["label"] for item in tests} != {"normal", "anomaly"}:
        raise ValueError("Final test must contain both normal and anomaly labels")
    images, reference_hashes = [], set()
    for name in references:
        image, digest = read_image(base / name)
        if digest in reference_hashes:
            raise ValueError("Duplicate reference image")
        images.append(image)
        reference_hashes.add(digest)
    seen = set(reference_hashes)
    test_images = []
    for item in tests:
        image, digest = read_image(base / item["path"])
        if digest in seen:
            raise ValueError("Test/reference overlap or duplicate test image")
        seen.add(digest)
        test_images.append((item, image, digest))
    encoder = VisualEncoder(device=device, require_amd=require_amd)
    encoder.extract(images[0])
    encoder.synchronize()
    start = perf_counter()
    features = [encoder.extract(image)[0] for image in images]
    bank, owners = make_bank(features)
    threshold = estimate_threshold(features, bank, owners, encoder.device)
    encoder.synchronize()
    onboarding_ms = (perf_counter() - start) * 1000
    results, latencies = [], []
    for item, image, digest in test_images:
        encoder.synchronize()
        start = perf_counter()
        patches, _ = encoder.extract(image)
        score = image_score(distances(patches, bank, encoder.device)[0])
        encoder.synchronize()
        latency = (perf_counter() - start) * 1000
        latencies.append(latency)
        results.append(
            {
                "path": item["path"],
                "sha256": digest,
                "label": item["label"],
                "score": score,
                "inference_ms": latency,
            }
        )
    return {
        "created_at": now(),
        "dataset": manifest.get("name", "unnamed"),
        "dataset_kind": manifest.get("dataset_kind", "unspecified"),
        "reference_count": len(images),
        "reference_hashes": sorted(reference_hashes),
        "encoder": encoder.signature,
        "runtime": encoder.info(),
        "threshold": threshold,
        "metrics": metrics(
            [int(r["label"] == "anomaly") for r in results],
            [r["score"] for r in results],
            threshold["value"],
        ),
        "onboarding_ms": onboarding_ms,
        "latency": {
            "p50_ms": float(np.median(latencies)),
            "p95_ms": float(np.quantile(latencies, 0.95)),
            "scope": "batch=1, warm encoder, preprocessing + encoding + retrieval; excludes disk/network/heatmap",
        },
        "samples": results,
        "limitations": [
            "Threshold estimated from references only, not probability calibration",
            "Exact pixel duplicates rejected; near-duplicates still require manual split review",
            "No pixel-level segmentation metrics computed",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"])
    parser.add_argument("--require-amd", action="store_true")
    args = parser.parse_args()
    report = run_benchmark(args.manifest, args.device, args.require_amd)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "runtime": report["runtime"],
                "metrics": report["metrics"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
