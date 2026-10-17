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
| POST | `/api/v1/profiles` | Multipart `name`, repeated `images` (3–200); job result `{profile_id, version_id}` |
| GET | `/api/v1/profiles/{id}` | Profile and active version ID |
| GET | `/api/v1/profiles/{id}/versions` | `{items: Version[]}` |
| POST | `/api/v1/profiles/{id}/inspections` | Multipart `image`; job result `{inspection_id}` |
| GET | `/api/v1/profiles/{id}/inspections` | `{items: Inspection[]}`; optional pagination and filters, see History |
| GET | `/api/v1/inspections/{id}` | Inspection result once ready |
| POST | `/api/v1/inspections/{id}/feedback` | JSON `{label: "normal" | "anomaly" | "unsure", note?: string}` |
| GET | `/api/v1/profiles/{id}/feedback` | `{items: Feedback[]}` |
| POST | `/api/v1/inspections/{id}/report` | Assistive VLM report; job result `{report_id, inspection_id}`; 503 if not configured |
| GET | `/api/v1/inspections/{id}/report` | Latest report for the inspection; 404 if none |
| GET | `/api/v1/reports/{id}` | Report by ID |
| POST | `/api/v1/profiles/{id}/batches` | Multipart repeated `images` (1–200); job result `{batch_id}` |
| GET | `/api/v1/profiles/{id}/batches` | `{items: Batch[]}` newest first |
| GET | `/api/v1/batches/{id}` | Batch with `counts` and `items` ranked by anomaly score |
| POST | `/api/v1/profiles/{id}/documents` | Multipart `file` (PDF/.txt/.md, ≤10 MiB); 201 document summary |
| GET | `/api/v1/profiles/{id}/documents` | `{items: DocumentSummary[]}` (no full text) |
| GET | `/api/v1/profiles/{id}/stats` | Measured onboarding, inspection and engineer-agreement figures |
| GET | `/api/v1/profiles/{id}/validation` | Frozen validation set; 404 if none |
| GET | `/api/v1/profiles/{id}/activations` | Activation history newest first |
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

## History (inspections)

`GET /api/v1/profiles/{id}/inspections` without parameters keeps the old shape `{items}` with every
inspection, newest first. Order is always `(created_at, id)` descending, never storage order.
Each item adds `feedback_label` (`normal | anomaly | unsure | null`), the engineer's label; it is
separate from the model's `decision`.

Query parameters (all optional): `limit` (1–200; enables paging), `cursor` (opaque, from
`next_cursor`), `since` / `until` (ISO 8601 with timezone, `since` inclusive, `until` exclusive),
`decision` (`normal | anomaly | review`, model), `human` (`none | any | normal | anomaly | unsure`).
With `limit` the response is `{items, next_cursor}`; `next_cursor` is null on the last page. Keep the
same filters while paging. Invalid cursor or a time without timezone returns 422.

```http
GET /api/v1/profiles/p1/inspections?limit=20&decision=anomaly&human=none
```
```json
{"items": [{"id": "…", "decision": "anomaly", "feedback_label": null, "created_at": "2026-10-18T03:10:00+00:00", "…": "…"}],
 "next_cursor": "WyIyMDI2LTEwLTE4VDAzOjEwOjAwKzAwOjAwIiwgIi4uLiJd"}
```

Open a row with `GET /api/v1/inspections/{id}`, its report with `GET /api/v1/inspections/{id}/report`.

## Report requests: reuse, keys and limits

- A report that is queued, running or ready for the inspection is **reused**: POST returns its job
  with `"reused": true` and makes no new model call. `?refresh=true` requests a new one.
- Optional `Idempotency-Key` header (1–200 chars): the same key returns the same report job; the
  same key for another inspection returns 409. Keys survive restarts.
- Global limits protect the shared Token Factory key: `WORKSIGHT_REPORT_HOURLY_LIMIT` (30) and
  `WORKSIGHT_REPORT_DAILY_LIMIT` (200). Over the limit: 429 `{"detail": "AI description limit
  reached for this demo; try again later"}`. Show it; do not retry automatically.
- After a restart unfinished reports are `failed`; they are never retried automatically.

```json
{"job_id": "…", "status": "queued", "resource_id": "<report id>", "job_url": "/api/v1/jobs/…", "reused": false}
```

## Batch inspection

`POST /api/v1/profiles/{id}/batches` with repeated `images` creates one ordinary inspection per
image (each has `batch_id` and `filename`) and one job. An unreadable image fails alone; the rest
continue. Poll the job, then:

```json
{"id": "b1", "profile_id": "p1", "version_id": "v1", "status": "ready", "total": 3, "processed": 3,
 "counts": {"normal": 1, "review": 0, "anomaly": 2, "failed": 0, "pending": 0},
 "items": [{"inspection_id": "i2", "filename": "part2.png", "status": "ready", "decision": "anomaly",
            "anomaly_score": 0.21, "inference_ms": 148.2}, "…"]}
```

`items` are ranked by anomaly score, highest first. `processed` grows while the job runs. Uploads
pass through the web proxy, so keep the combined request under its size limit (e.g. send 50 at a time).

## Part documentation

`POST /api/v1/profiles/{id}/documents`, multipart `file`: PDF with a text layer, `.txt` or `.md`,
≤10 MiB. Text is extracted on the backend (scanned PDFs without text return 422; OCR is not
supported). Duplicate file → 409. Response (full text is never returned):

```json
{"id": "d1", "profile_id": "p1", "created_at": "…", "filename": "spec.pdf", "kind": "pdf", "pages": 4,
 "sha256": "…", "chars": 5210, "truncated": false, "excerpt": "Connector pins must be straight…"}
```

Documents are used **only** by the AI report: up to 4000 characters of them are added to the
prompt and the report returns `relevant_requirements` (strings, may be empty) and `documents_used`
(document IDs). They are sent to AMD Token Factory only when a report is requested. The detector's
decision, score and threshold never use documents.

## Stats

`GET /api/v1/profiles/{id}/stats` reports facts from the profile's own records:

```json
{"profile_id": "p1", "created_at": "…", "versions": 1,
 "onboarding": {"version_id": "v1", "reference_count": 20, "build_ms": 8646.0, "memory_patches": 46080,
                "scope": "feature extraction + memory + threshold, warm encoder; no model training"},
 "inspections": {"count": 42, "decisions": {"normal": 30, "review": 4, "anomaly": 8},
                 "inference_ms_p50": 147.0, "inference_ms_p95": 212.0, "first_at": "…", "last_at": "…"},
 "engineer_review": {"feedback_count": 12, "labels": {"normal": 7, "anomaly": 4, "unsure": 1},
                     "model_to_human": {"anomaly->anomaly": 4, "review->normal": 2, "…": 0},
                     "agreement": {"agree": 9, "compared": 10, "rate": 0.9,
                                   "rule": "normal/anomaly decisions vs normal/anomaly labels; review and unsure excluded"}},
 "batches": 2, "reports": {"ready": 5, "failed": 0}}
```

`rate` is null when nothing is compared. Present it as agreement on reviewed parts, not accuracy.

## Validation and activation history

`GET /api/v1/profiles/{id}/validation` → `{id, profile_id, created_at, baseline_version_id, frozen:
true, counts: {normal, anomaly}, samples: [{sha256, label, image_url}]}`; 404 `{"detail":
"'validation set not found'"}` when none. Read-only.

`GET /api/v1/profiles/{id}/activations` → `{items: [{id, profile_id, from_version_id, to_version_id,
created_at, activated_at, to_version_created_at}]}`. The initial version is set at profile creation
and has no activation record; restores and applied candidates do.

## Large profiles

Up to 200 references. Above 80,000 memory patches (`WORKSIGHT_MAX_MEMORY_PATCHES`) each reference
keeps an equal share of its patches (`Version.memory_per_reference`; null means all kept). The
threshold scores at most 30 references leave-one-out, evenly spaced (`threshold.scored_references`).

## Restarts

Jobs run in-process. On restart every queued/running job, profile, inspection, report and batch
becomes `failed` with `error: "Server restarted before this finished; submit it again"`. Nothing is
resumed or retried automatically.

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
