# Worksight

Reference-based industrial visual inspection for quality engineers. AMD Developer Hackathon ACT III,
Intelligent Industry. Team: Desert Eagles · MIT.

Create a profile from known-good samples, inspect a new image, compare the heatmap with a similar
reference and record engineer feedback separately from the model decision. Confirmed-normal feedback
builds a candidate version. It must pass a comparison against the current version on separate
labelled validation images before explicit activation.

## Current status

- **Web app** (`web/`, Next.js): live adapter connects to the actual FastAPI API, including
  transient profile drafts, multipart reference builds, inspections, immutable feedback,
  validation, candidate evaluation, explicit activation and restore. Demo remains a separate mode.
- **Backend** (`backend/`, FastAPI + PyTorch): its contract is [docs/API.md](docs/API.md).
  Web mapping and remaining requests to ML are in [docs/api-contract.md](docs/api-contract.md).
- **AMD:** local CPU execution is not AMD evidence; target ROCm execution still needs verification.

No GPU status, confidence percentage, benchmark or quality improvement is fabricated. Measured
results are only in [docs/BENCHMARK.md](docs/BENCHMARK.md).

## Run the web app

Requirements: Node.js 24 LTS and npm.

```bash
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The example env selects demo explicitly. Development uses Webpack for compatibility with macOS file watching. On a host with restricted file watching, run the production build and start commands below.

## Operator flow

1. Click **New profile**, enter a part name and camera view.
2. Add known-good JPEG, PNG or WebP images, or choose **Use example sample** in demo. Click **Upload samples**, then **Build profile**.
3. Click **Inspect with this profile**. Upload a new image or choose **Use example part image** in demo, then **Run inspection**.
4. Adjust heatmap opacity and switch between Heatmap, Original and Compare.
   Use the viewer's zoom controls and Fit button to examine the surface. Drag to pan when zoomed in. Image display settings and engineer review share the right sidebar.
5. Choose a **Human decision**, add a note and save. The model decision remains unchanged.
6. In live mode open **Reference samples → Validation & versions**. Upload a distinct 5+5 validation set and acknowledge that it will be frozen. Select Pass feedback, build a candidate, evaluate, inspect the measured report, then Apply only when the gate passes. Restore uses an approved earlier version. Existing inspections keep the version they originally used.

Live **New profile** creates an unsent draft only in the current tab. Stage 3–50 distinct reference
images (10–20 recommended), then Build to upload and persist them on FastAPI. Reloading loses an
unsent draft. Existing saved profiles accept new references through validated engineer feedback.
Live descriptions are unavailable until the backend stores them. Saved live feedback is immutable.

Demo inspection returns a fixed example regardless of upload content. It demonstrates UI behavior and cannot assess real parts. Demo must not be used for real inspections.

Live history, measured candidate comparison, explicit activation and restore use the backend workflow. These features remain **Planned** in demo. Demo builds simulate version changes without training. Demo data resets on reload. FastAPI owns all durable live records.

## Connect FastAPI

Set these in `web/.env.local` or server secrets, then restart:

```dotenv
WORKSIGHT_MODE=live
WORKSIGHT_API_URL=http://127.0.0.1:8000
WORKSIGHT_API_TOKEN=
```

The URL is the backend origin without `/api/v1`. The optional token stays server-side and must equal the backend's `WORKSIGHT_API_KEY`. Never prefix credentials with `NEXT_PUBLIC_`. Browser calls go through `/api/backend/api/v1/...`, so this pattern does not require browser-to-FastAPI CORS.

See the [web adapter mapping and Requests to ML](docs/api-contract.md), and the backend's actual [API](docs/API.md). The old OpenAPI proposal is archived and does not describe live endpoints. Live failures never switch to demo. Without an explicit mode the app shows setup instructions and disables operations.

## Web production and deployment

```bash
cd web
npm ci
npm run build
npm start
```

The build prepares a standalone Next.js server including static assets. PORT defaults to 3000. Configure the mode, backend URL and optional token at runtime. Deploy to any Node-compatible host. On Vercel choose project root `web/` and configure the same server variables.

Container deployment from `web/`:

```bash
docker build -t worksight-web .
docker run --rm -p 3000:3000 --env-file .env.local worksight-web
```

Live deployment belongs on the intended internal network or behind the host's access controls. Application authentication is outside v1 scope. A hosted demo uses synthetic data only.

A verified real-data CPU walkthrough and remaining limitations are recorded in
[Live adapter verification](docs/live-adapter-verification.md).

## Web validation

```bash
cd web
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover upload rejection, schema validation, proxy restrictions, bounded uploads, outages, failed/cancelled jobs and separate model/human decisions. The browser scenario covers creation through repeat inspection with an updated profile and a mobile viewport. Some restricted hosts block Chromium startup; see [verification](docs/verification.md) for actual results and a manual checklist.

## Backend: implemented

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

**Not implemented:** PDF specification extraction, sensor forecasts, camera-shift diagnosis or active
onboarding sample selection.

## Backend local development

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
including images. The web app proxies requests through its server; never expose the key in
`NEXT_PUBLIC_*`. Configure allowed origins with `WORKSIGHT_CORS_ORIGINS`.

PyTorch uses the `cuda` device name for HIP/ROCm too. Worksight checks `torch.version.hip` as well,
so an NVIDIA device is not reported as AMD. [GPU access instructions](docs/AMD_ACCESS.md).

The [ROCm Dockerfile](backend/Dockerfile.rocm) requires a verified target-compatible image tag through
`ROCM_IMAGE`. It preserves the image's PyTorch. Container execution remains to be tested on Linux/AMD.

## Inspection report on AMD Token Factory

Optional. With `RADEON_API_KEY` set, `POST /api/v1/inspections/{id}/report` asks a vision-language
model hosted on AMD GPUs (Token Factory: `Gemma-4-31B-IT`, falling back to `DeepSeek-V4.1-Flash`)
to describe what is visibly different between the inspected part, its heatmap overlay and the most
similar reference. The detector's decision, score and threshold are passed in and never changed;
the report is labelled assistive and records which model answered. Details: [docs/API.md](docs/API.md).

The images go to AMD's hosted endpoint (`developer.amd.com.cn`) only on request; per AMD's terms,
prompts and outputs are kept for about two days and not used for training. Do not use it for
confidential parts. The team key has a shared daily cap and about 20 requests per minute.
This is **not** the detector's inference: running the detector itself on AMD still requires an AMD
GPU instance (see AMD deployment).

## Real-data benchmark

Current results on VisA PCB (CC BY 4.0), CPU only, with reproduction and AMD rerun commands:
[docs/BENCHMARK.md](docs/BENCHMARK.md).

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

## Limits

- Run **one process / one worker**. The queue is in-process, not distributed.
- No multi-user tenancy, retention UI or production authorization system.
- 3–50 distinct references; 10 MiB and 16 million pixels/image; validation at most 100 images.
- Full image resized to 224×224 without cropping. Aspect distortion, lighting changes, small defects
  and new camera views may reduce performance. Heatmap is indicative localization.
- No claim of arbitrary-machine generalization, causal diagnosis or remaining-life prediction.

## Layout and ownership

```text
web/src/app/          Next.js pages, styles and server proxy
web/src/components/   Operator workspace and upload previews
web/src/lib/          Schemas, API client, jobs and disposable fixtures
web/tests/            Contract and operator tests
backend/              FastAPI service, detector, encoder, store, evaluation, tests
scripts/              Smoke test and VisA manifest builder
docs/                 API contracts, conventions, verification, AMD access, benchmark, plan
submission/           Cover, description, slides and demo materials
```

ML developer owns `backend/`, `scripts/`, evaluation and AMD execution. Web developer owns `web/`,
web deployment, slides, video and cover. Coordinate API changes through [docs/API.md](docs/API.md)
and [docs/api-contract.md](docs/api-contract.md).

[Web conventions](docs/web-conventions.md) · [Submission draft](submission/description.md) · [Demo script](submission/demo-script.md)

## License

See [LICENSE](LICENSE).
