# Worksight

Reference-based visual inspection for AMD Developer Hackathon ACT III, Intelligent Industry.
Team: Desert Eagles · MIT.

Create a profile from healthy images, inspect a new image, review the heatmap and record human
feedback. Confirmed-normal feedback builds a candidate version. It must pass a comparison against
the current version on separate labelled validation images before explicit activation.

## Implemented

- Frozen ImageNet ResNet-18 layer2/layer3 features; no LLM.
- Persistent reference memory, nearest-patch retrieval, anomaly score, heatmap and similar reference.
- Profiles, inspections, feedback, immutable model versions and activation audit on local disk/SQLite.
- Background queue with polling API; interrupted jobs become failed on restart.
- Candidate evaluation, regression gate, explicit activation and rollback.
- Offline benchmark: image AUROC, F1, false-positive rate, recall, latency and hardware metadata.
- ROCm-aware device selection; `WORKSIGHT_REQUIRE_AMD=1` refuses CPU/NVIDIA fallback.

This is a **PatchCore-inspired baseline**, not a reproduction: ResNet-18, normalized concatenated
features, deterministic per-reference random sampling, cosine distance and top-1%-patch image score.
Do not quote published PatchCore metrics as Worksight results.

**Not implemented:** Next.js frontend (teammate's work), PDF specification extraction, sensor forecasts,
camera-shift diagnosis or active onboarding sample selection. AMD inference is only verified by an
actual AMD run. Local Mac execution is not AMD evidence.

## Local development

Python 3.11+, from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './backend[ml,dev]'
cp .env.example .env
uvicorn worksight.api:app --host 127.0.0.1 --port 8000 --env-file .env --workers 1
```

Open `http://127.0.0.1:8000/docs`. `GET /health` is liveness, not model readiness.
`POST /api/v1/runtime/warmup` loads the encoder and returns a job. First load downloads approximately
45 MB of official torchvision weights; failures never fall back to random weights.

Frontend handoff: [docs/API.md](docs/API.md). Build the application in `frontend/`.

```bash
TORCH_HOME=./data/torch python scripts/smoke.py --device cpu
pytest backend/tests -q
ruff check --config backend/pyproject.toml backend scripts
```

Smoke runs the real pretrained encoder through HTTP on generated fixtures, writing
`work/smoke/smoke-report.json` and image artifacts. It is **not an industrial accuracy benchmark**.
Unit/API tests inject a tiny deterministic test encoder, unavailable in the running app.

## AMD deployment

Use a Linux AMD GPU environment with compatible ROCm PyTorch already installed. Do not install
the `ml` extra over the vendor PyTorch.

```bash
python -m pip install -e ./backend
export WORKSIGHT_DEVICE=cuda
export WORKSIGHT_REQUIRE_AMD=1
export TORCH_HOME=./data/torch
python -c 'import torch; assert torch.version.hip and torch.cuda.is_available(); print(torch.cuda.get_device_name(0), torch.version.hip)'
uvicorn worksight.api:app --host 0.0.0.0 --port 8000 --workers 1
```

Set `WORKSIGHT_API_KEY` remotely and send `Authorization: Bearer <key>` on every `/api/v1` request,
including images. The frontend should proxy requests through its server; never expose the key in
`NEXT_PUBLIC_*`. Configure allowed origins with `WORKSIGHT_CORS_ORIGINS`.

PyTorch uses the `cuda` device name for HIP/ROCm too. Worksight checks `torch.version.hip` as well,
so an NVIDIA device is not reported as AMD. [GPU access instructions](docs/AMD_ACCESS.md).

The [ROCm Dockerfile](backend/Dockerfile.rocm) requires a verified target-compatible image tag through
`ROCM_IMAGE`. It preserves the image's PyTorch. Container execution remains to be tested on Linux/AMD.

## Real-data benchmark

Manifest paths are relative to its directory:

```json
{
  "name": "your-part-category",
  "dataset_kind": "real_industrial",
  "references": ["normal/train-01.png", "normal/train-02.png", "normal/train-03.png"],
  "test": [
    {"path": "test/normal-01.png", "label": "normal"},
    {"path": "test/scratch-01.png", "label": "anomaly"}
  ]
}
```

This illustrates the format, not sufficient sample size. Prefer 10–20 diverse references and a
representative, separate test set. Respect dataset licensing. Exact duplicate images are rejected;
manually keep near-duplicates and views of the same physical part out of different splits.

```bash
python -m worksight.benchmark --manifest data/dataset/manifest.json --output data/evidence/cpu.json --device cpu
python -m worksight.benchmark --manifest data/dataset/manifest.json --output data/evidence/amd.json --device cuda --require-amd
```

Threshold uses leave-one-reference-image-out scores, 95th percentile × 1.2, floor 0.005. This is
**heuristic, not calibrated probability or a guaranteed false-positive rate**. API decisions use a
±10% review band. Binary benchmark metrics use `score >= threshold` and disclose that rule. No test
labels tune the threshold. Timings include preprocessing, encoder and retrieval with synchronization,
but exclude model loading, disk, heatmap and network.

## Feedback evaluation

1. Register separate labelled validation images (minimum 5 normal + 5 anomaly; this guard does not
   establish statistical sufficiency). The validation set is frozen for the profile.
2. Record human feedback on a new inspection. Feedback alone changes no model.
3. Select confirmed-normal feedback to build a candidate. Anomaly/unsure labels and validation
   images cannot enter normal memory.
4. Compare baseline and candidate on the same validation images, keeping the baseline threshold.
5. Activation requires no additional false positives **and** no additional false negatives. Equality
   passes; the report separately says whether measured improvement occurred.
6. Explicitly apply, or restore an approved version using the same activation endpoint.

Repeated selection can overfit validation. Keep a separate untouched final test for submission.
A passing gate is not a production safety guarantee.

## Limits and ownership

- Run **one process / one worker**. The queue is in-process, not distributed.
- No multi-user tenancy, retention UI or production authorization system.
- 3–50 distinct references; 10 MiB and 16 million pixels/image; validation at most 100 images.
- Full image resized to 224×224 without cropping. Aspect distortion, lighting changes, small defects
  and new camera views may reduce performance. Heatmap is indicative localization.
- No claim of arbitrary-machine generalization, causal diagnosis or remaining-life prediction.
- ML developer owns `backend/`, `scripts/`, evaluation and AMD execution. Teammate owns `frontend/`,
  web deployment, slides, video and cover. Coordinate changes through `docs/API.md`.
