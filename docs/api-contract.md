# Worksight web adapter and FastAPI contract

The live source of truth is `backend/src/worksight/api.py` and `service.py`; see [API.md](API.md).
The original `/v1` proposal in `openapi.proposed.json` is archived. It is not the live server API.
`web/src/lib/backend-contract.ts` validates actual backend payloads; `contract.ts` describes the
normalized UI model. `backend-api.ts` owns the live adapter. `demo.ts` remains independent.

## Transport and credentials

Browser requests: `/api/backend/api/v1/...`; Next.js forwards to `WORKSIGHT_API_URL/api/v1/...`.
`WORKSIGHT_API_URL` is the origin, e.g. `http://127.0.0.1:8000`, without `/api/v1`.
`WORKSIGHT_API_TOKEN` becomes a server-side Bearer header and must equal `WORKSIGHT_API_KEY`.
The same proxy and authorization protect image requests. Only backend assets matching
`/api/v1/assets/(32 or 64 lowercase hex).png` are accepted. MIME must be `image/png`.
No upstream redirects, arbitrary routes, browser credentials, or live-to-demo fallback.

The proxy permits the GET/POST routes in API.md, plus GET `/health`. It preserves meaningful
FastAPI `detail` strings/validation messages for request/state errors and sanitizes server errors.
Cross-origin mutations are rejected. Proxy body limit
is 128 MiB including multipart metadata (client combined limit 120 MiB). Backend limits: 10 MiB/file, 16 million pixels/image,
3–200 distinct references. These fixed limits are declared by the adapter; there is no `/capabilities`.

## Creating a profile

The UI keeps its three-step interaction without inventing server endpoints:

1. `createProfile` creates an unsent name-only form draft in the current adapter instance.
2. `uploadSamples` stages selected File objects in the same transient draft. Files are validated
   and previewed locally. Nothing is uploaded or saved at these two steps.
3. `buildProfile` sends one POST `/api/v1/profiles`, multipart `name` and repeated `images`.
   The returned real job ID is polled. The UI switches from its local draft ID to
   `job.result.profile_id` after success. Backend records then replace the draft.

Draft notices explicitly say reload discards unsent names/files. No localStorage, second database,
profile persistence, or fake backend job exists in the adapter. Description input is unavailable
in live mode because FastAPI does not store it. Accepted submissions are not automatically retried.

Profiles are fetched from FastAPI. `queued/running` map to `building`. Active reference count and
thumbnail come from the active version. Versions are numbered in ascending `created_at` order,
with ID as a deterministic tie-breaker. Backend IDs remain authoritative. Creation timestamps use
ISO offsets. The UI's `updated_at` compatibility field comes from active-version creation time
(or profile creation when no version exists); the live label is **Version created**, not a claim
about last activation time.

## Inspection and engineer feedback

POST `/profiles/{profile_id}/inspections` takes multipart `image`. Poll the returned job and GET
`/inspections/{inspection_id}`. The adapter maps `normal/anomaly/review` to `pass/fail/review`,
`image_url` to `original_url`, `inference_ms` to `processing_ms`, and `version_id` to its display
number. Feedback is separately loaded from `/profiles/{id}/feedback` by `inspection_id`.

Model score, threshold, threshold status, inference time, runtime, original/overlay/heatmap/reference
URLs and reference-reuse warning are retained from actual results. The score is labelled
**Anomaly score**, never confidence. AMD is shown only when `runtime.amd_gpu === true`.

POST feedback sends `{label: normal|anomaly|unsure, note}`. It returns a feedback record;
the adapter rereads the authoritative inspection and feedback list. Saved live controls are locked.
Same-label submissions preserve the backend's original note. HTTP 409 explains that another
engineer decision already exists; the model result and saved review are never replaced locally.

## Jobs

Only real job IDs are polled. `stage=operation`, `progress=null`; no made-up completion percentage
or cancellation support. Backend error strings become `{code: processing_failed, message}`.
Result preserves profile, inspection, version, evaluation IDs and gate. Dates accept timezone offsets.
Polling is bounded to ten minutes. Aborting UI polling does not cancel backend work.

## Validated updates and restore

Live workflow in Reference samples → Validation & versions:

1. POST `/profiles/{id}/validation`, repeated multipart `normal` and `anomaly`, minimum 5+5,
   maximum 100 total. Explicit acknowledgement explains this set is frozen once per profile.
   Backend rejects overlap with references/feedback. A separate final test set must stay untouched.
2. Load profile feedback, choose only confirmed-normal entries; POST `/candidates` with
   `{feedback_ids}` and poll its real job. The candidate is not active.
3. POST `/versions/{version_id}/evaluate`, poll, then GET `/evaluations/{evaluation_id}`.
   Show actual baseline/candidate metrics, gate and runtime. Reports are validation for selection,
   not final test results. `passed=true, improved=false` says **no regression**, not improvement.
4. Apply is enabled only for a passed report whose baseline is still the active version and whose
   candidate is not already approved. POST `/versions/{version_id}/activate`; reread backend state.
5. Restore calls the same activate endpoint for a non-active approved version after confirmation.
   Existing inspection records keep their original version.

History/restore and evaluated comparisons are connected through the dedicated workflow. The compatibility compare method reads an existing evaluation for the exact pair (or reports none);
it does not invent arbitrary comparison metrics. Compatibility rollback resolves the displayed
number to an approved opaque ID and calls activate synchronously, without manufacturing a job.

## Requests to ML

These are recorded requirements, not changes made to backend code:

1. Optional persisted profile description/camera-view field. The live UI currently omits this input.
2. Read endpoint for an existing frozen validation set (at least counts/labels and baseline). Today
   profile `validation_id` proves it exists, but its saved contents cannot be loaded through the API.
3. Profile `updated_at` / activation timestamp and an activation-audit read endpoint, to show when
   the active version changed. Current UI only labels actual version creation time.
4. Stable idempotency key for profile/candidate creation and a way to rediscover jobs for a resource.
   If a POST response is lost or the page reloads, polling cannot be resumed from a saved job list.
   The web intentionally never retries a mutation automatically.
5. An explicit manual-resolution procedure for conflicting immutable engineer labels, including
   incorrect notes. The web locks saved records and reports 409; it does not bypass immutability.
6. Reachable AMD/ROCm deployment and measured run evidence. Local CPU checks do not establish AMD
   execution or production defect-detection quality. Dataset metrics require separate evaluation.
