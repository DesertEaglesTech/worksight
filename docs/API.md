# Worksight API — frontend handoff

Development: `http://127.0.0.1:8000`. Interactive docs: `/docs`; schema: `/openapi.json`.
Build the frontend in `frontend/`. Keep all API calls in one client module.

## Background jobs

Long operations return HTTP 202:

```json
{"job_id": "opaque-id", "status": "queued", "resource_id": "id-or-null", "job_url": "/api/v1/jobs/opaque-id"}
```

Poll `job_url` about once per second; stop on `succeeded` or `failed`. Jobs contain `operation`,
`result`, `error` and timestamps. Read `result` only on success. Jobs use `succeeded`; profiles and
inspections use `ready`. Disable duplicate submission while a request is pending.

| Method | Route | Input / result |
|---|---|---|
| GET | `/health` | Liveness, model-loaded flag, actual runtime if loaded |
| POST | `/api/v1/runtime/warmup` | Load model; job result is runtime info |
| GET | `/api/v1/profiles` | `{items: Profile[]}` |
| POST | `/api/v1/profiles` | Multipart `name`, repeated `images`; job result `{profile_id, version_id}` |
| GET | `/api/v1/profiles/{id}` | Profile and active version ID |
| GET | `/api/v1/profiles/{id}/versions` | `{items: Version[]}` |
| POST | `/api/v1/profiles/{id}/inspections` | Multipart `image`; job result `{inspection_id}` |
| GET | `/api/v1/profiles/{id}/inspections` | `{items: Inspection[]}` |
| GET | `/api/v1/inspections/{id}` | Inspection result once ready |
| POST | `/api/v1/inspections/{id}/feedback` | JSON `{label: "normal" | "anomaly" | "unsure", note?: string}` |
| GET | `/api/v1/profiles/{id}/feedback` | `{items: Feedback[]}` |
| POST | `/api/v1/inspections/{id}/report` | Assistive VLM report; job result `{report_id, inspection_id}`; 503 if not configured |
| GET | `/api/v1/inspections/{id}/report` | Latest report for the inspection; 404 if none |
| GET | `/api/v1/reports/{id}` | Report by ID |
| POST | `/api/v1/profiles/{id}/validation` | Multipart repeated `normal` and `anomaly`; frozen labelled validation set |
| POST | `/api/v1/profiles/{id}/candidates` | JSON `{feedback_ids: string[]}`; job result `{profile_id, version_id, state}` |
| POST | `/api/v1/profiles/{id}/versions/{version}/evaluate` | Job result `{evaluation_id, gate}` |
| GET | `/api/v1/evaluations/{id}` | Baseline/candidate metrics, sample scores, gate and hardware |
| POST | `/api/v1/profiles/{id}/versions/{version}/activate` | Apply validated candidate or restore approved version |
| GET | `/api/v1/jobs/{id}` | Job status and result |
| GET | `/api/v1/assets/{filename}` | Actual PNG image; authentication applies |

IDs are opaque. `Version.state="approved"` means eligible, not currently active. Compare with
`Profile.active_version_id`. The initial version uses a heuristic threshold, without labelled evaluation.

## Inspection fields

When `status="ready"`:

- `id`, `profile_id`, `version_id`, `created_at`, `finished_at`.
- `image_url`, `heatmap_url` (transparent overlay), `overlay_url` (composited), `reference_url`.
- `anomaly_score`, `threshold`, `decision` (`normal`, `anomaly`, `review`).
- `threshold_status="heuristic_not_probability"`: display "Anomaly score", never "confidence %".
- `inference_ms`: preprocessing + encoder + retrieval; excludes loading, disk, rendering and network.
- `runtime`: device, device name, torch/torchvision versions, HIP version, encoder ID and `amd_gpu`.
  Show an AMD badge only when `amd_gpu=true`.
- `matches_reference_image`: reused reference warning; this is not an independent test example.

The reference is chosen by nearest-patch votes, not a causal explanation. Heatmap uses a consistent
profile-relative scale; do not normalize each image independently into a misleading hot spot.

## Inspection report (assistive, optional)

A vision-language model on AMD Token Factory describes a **ready** inspection. It receives the
original image, the heatmap overlay, the most similar reference and the detector's decision, score
and threshold. It **never changes** `decision`, `anomaly_score` or `threshold`, and it is not a
second classifier. Images leave the backend only when this endpoint is called.

Enabled only when the server has `RADEON_API_KEY`; check `GET /health` → `report.enabled`.
When disabled, POST returns 503: hide or disable the button.

Models are tried in order (`WORKSIGHT_REPORT_MODELS`, default `Gemma-4-31B-IT,DeepSeek-V4.1-Flash`).
The next model is tried only after a server error, timeout or malformed output. A rate limit (429)
or rejected key stops immediately. Expect 15–60 s; the job runs outside the GPU queue.

Report fields when `status="ready"`:

- `summary`, `observations` (up to 8 strings), `suggested_check` (string or null).
- `heatmap_consistency`: `consistent | partly_consistent | inconsistent | unclear`; the model's view of
  whether the highlighted regions show a visible difference.
- `model` (requested ID that answered), `served_model`, `provider` (`AMD Token Factory`),
  `latency_ms`, `usage` tokens, `failed_attempts` (models skipped and why).
- `assistive_only: true`, `model_decision` (detector decision at request time), `inputs`.

On failure `status="failed"` and `error` holds an operator-safe message, also in the job's `error`.

UI rules: label it "AI description (assistive)", show the model name and "runs on AMD Token Factory",
keep it visually below the detector result and the engineer's decision, and never present
`heatmap_consistency` as a confidence or a verdict. The text can be wrong; the engineer decides.

## Upload example

```typescript
const form = new FormData();
form.append("name", name);
for (const file of references) form.append("images", file);
const response = await fetch(`${baseUrl}/api/v1/profiles`, { method: "POST", body: form });
if (!response.ok) throw new Error(await response.text());
const job = await response.json();
```

Do not manually set multipart Content-Type. Asset URLs are relative to the **backend**.
For authenticated remote use, proxy API and images through the Next.js server. A plain `<img>`
cannot set a Bearer header. Keep the backend key server-side, never in `NEXT_PUBLIC_*`.

## Errors and state

- 401 auth; 404 missing entity; 409 state conflict; 422 invalid input.
- `{detail: ...}` may contain a string or a FastAPI validation array.
- Feedback is immutable per inspection in the MVP. Same-label resubmission is idempotent;
  conflicting label returns 409. Feedback does not immediately modify the model.
- Candidates do not become active until evaluation passes and the user applies them.
- Show pending/error/empty states. Development mock data must be visibly labelled; final demo uses
  real API results.

## Screen priorities

1. Profiles: create, upload thumbnails, poll preparation, select ready profile.
2. Inspect: upload, poll, show original/heatmap/reference, result and feedback controls.
3. Review: choose feedback, build candidate, evaluate, compare, apply or restore version.

Do not add unimplemented sensor forecasts, PDF intelligence, fabricated confidence or savings.
