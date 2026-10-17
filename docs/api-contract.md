# Worksight API v1 — proposal for ML review

Status: proposed, awaiting confirmation from the ML developer. No backend or OpenAPI specification existed in this checkout when web work started. This is not yet an agreed or deployed API.

`docs/openapi.proposed.json` is exported from the same Zod response schemas the client validates. Regenerate with `cd web && npm run contract:export` on Node 24.

## Ownership and transport

FastAPI owns profiles, files, jobs, inspection results, feedback and version history. The web app has no profile database or localStorage persistence. Demo state is isolated in memory and discarded on reload. Live failures never switch to demo.

Browser calls use `/api/backend/v1/...`. The server proxies only the listed operations to `WORKSIGHT_API_URL`. The optional `WORKSIGHT_API_TOKEN` becomes an upstream Bearer header, never a browser credential. Relative image URLs must be `/v1/assets/{asset_id}`, serving PNG, JPEG or WebP. HTTPS signed image URLs are also supported.

## Operations

| Method and path | Request | Successful response |
| --- | --- | --- |
| GET `/v1/capabilities` | None | Capabilities |
| GET `/v1/profiles` | None | `{items: Profile[]}` |
| POST `/v1/profiles` | JSON `{name, description}` | Profile, HTTP 201 |
| POST `/v1/profiles/{id}/samples` | Multipart repeated `files` | Updated Profile |
| POST `/v1/profiles/{id}/build` | JSON `{}` | `{job_id}`, HTTP 202 |
| GET `/v1/jobs/{id}` | None | Job |
| POST `/v1/inspections` | Multipart `profile_id`, `image` | `{job_id}`, HTTP 202 |
| GET `/v1/inspections/{id}` | None | Inspection |
| POST `/v1/inspections/{id}/feedback` | JSON `{human_decision, comment}` | Inspection with feedback |
| GET `/v1/assets/{id}` | None | PNG/JPEG/WebP image |
| GET `/v1/profiles/{id}/versions` | None | `{items: ProfileVersion[]}` |
| GET `/v1/profiles/{id}/compare?from=1&to=2` | None | VersionComparison |
| POST `/v1/profiles/{id}/rollback` | JSON `{version}` | `{job_id}`, HTTP 202 |

The last three operations are optional. Advertise them only when implemented. The v1 profile list is unpaginated; agree pagination before changing it. Return JSON rather than 204 for operations that expect a body.

## Capabilities

```json
{
  "api_version": "1",
  "limits": {
    "max_file_bytes": 20971520,
    "max_files": 50,
    "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]
  },
  "features": {
    "feedback": true,
    "profile_updates": true,
    "version_history": false,
    "version_comparison": false,
    "rollback": false
  }
}
```

These are proposed upload limits, not performance measurements. Proxy limit: 52 MiB including multipart metadata. Client combined file limit: 50 MiB. Backend must independently validate signatures, image dimensions, size and content. Do not trust client MIME types.

## Profiles and builds

Profile fields: `id`, `name`, `description`, `status`, `version`, `sample_count`, `thumbnail_url`, `updated_at`. Status: `draft | building | ready | failed`. A new profile starts at version 0. Timestamps use ISO 8601 with timezone. Nullable image fields are explicit null.

`sample_count` counts accepted known-good references. Upload does not silently replace the active version. Build consumes pending references and, when `profile_updates` is enabled, the supported engineer-correction workflow. A rejected part is never automatically treated as a good sample. Backend owns the ML update procedure and atomically activates a successful version. Existing inspections retain the exact version used. Feedback acceptance alone implies neither retraining nor improvement.

## Jobs

```json
{
  "id": "job-123",
  "status": "running",
  "stage": "Extracting reference features",
  "progress": null,
  "result": null,
  "error": null
}
```

Statuses: `queued | running | succeeded | failed | cancelled`. Progress is a measured fraction 0–1 or null. Do not infer percentages from elapsed time. Success returns `result: {profile_id}` for build/rollback or `{inspection_id}` for inspection. Failure sets `error: {code, message}` with operator-safe text. Every job includes stage, progress, result and error even when null.

The client polls every 1.1 seconds, stops on a terminal state and has a 10-minute polling deadline. Each HTTP request times out. Leaving the workspace aborts polling, not the backend job. POST operations are not automatically retried. Discuss backend idempotency before adding mutation retries.

## Inspection

```json
{
  "id": "inspection-123",
  "profile_id": "profile-123",
  "profile_version": 1,
  "original_url": "/v1/assets/original-123.png",
  "heatmap_url": "/v1/assets/heatmap-123.png",
  "reference_url": "/v1/assets/reference-456.png",
  "model_decision": "review",
  "processing_ms": null,
  "created_at": "2026-10-17T12:00:00Z",
  "feedback": null
}
```

Decision: `pass | fail | review`. Use review for inconclusive outcomes. Heatmap aligns with the original dimensions and orientation. Return a transparent PNG overlay with anomalous regions colored; the UI applies opacity. Heatmap/reference URLs may be null. Processing time is measured backend milliseconds or null, never browser round-trip duration. The contract contains no invented confidence or GPU utilization.

## Engineer review

Request: `{human_decision: "pass" | "fail" | "review", comment: string}`. Repeated POST updates this inspection's review. Preserve `model_decision`, and return `feedback: {id, human_decision, comment, created_at}`. Human confirmation never overwrites the model result. The web form limits comments to 2000 characters.

## Optional versions

ProfileVersion: `{version, created_at, sample_count, source, active}`. VersionComparison: `{from_version, to_version, summary, metrics: [{name, before, after, unit}]}`. Before/after may be null. An empty metrics array means no evaluation metrics were reported. Backend defines names and units. Rollback returns a job, atomically changes the active version and preserves inspection records. The UI asks before restoring.

## Errors

`{error: {code, message}}`, with HTTP 400/404/409/413/415/422/429/500 as appropriate. Avoid infrastructure details and tracebacks. The proxy sanitizes upstream errors. A response schema mismatch is an integration error, never an empty success.

## Confirmation requested from ML developer

1. Confirm endpoint names, enums and nullable fields, or return an OpenAPI diff.
2. Confirm feedback-to-build semantics and what the implemented update consumes.
3. Provide a reachable service URL and image URL policy. Deliver credentials through server secrets, not chat or Git.
4. State which optional capabilities work today.
5. Provide a real good set, test image, AMD hardware/model/ROCm run evidence and real result for final end-to-end validation. Hardware and benchmark claims require evidence.
