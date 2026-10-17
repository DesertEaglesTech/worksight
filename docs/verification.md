# Web verification and integration status

Date: 2026-10-17. Repository initially contained no application source or backend. The API is a proposal awaiting the ML developer's review.

## Verified

- Strict TypeScript check passes.
- Production Next.js build and standalone asset preparation pass.
- 14 unit tests pass: 8 contract/file/job tests and 6 server proxy tests.
- Production server serves the workspace and PNG assets with HTTP 200.
- Demo mode rejects live proxy requests with HTTP 503.
- A live-mode server pointed at an unreachable local service returns HTTP 502 with an operator-facing error, rather than fixtures.
- In the built-in browser: created a new profile, previewed a sample, uploaded it, built v1, inspected a new image, changed heatmap opacity to 40%, opened reference comparison, recorded an independent Fail engineer decision while the model remained Needs review, requested v2 and inspected again. The earlier result retained v1 and the new result displayed v2.
- Browser checks at width 390 px: content width equals viewport width, no horizontal page overflow, image and controls adapt to one column.
- In the standalone production build: selected a valid file through the system chooser and completed a demo inspection. SVG and a corrupt PNG were rejected before inspection. No browser console errors were observed during that check.
- Fresh live-mode browser run shows the unavailable-service message and reconnect control. Profile count is unknown until records can be loaded.

## Limits of those checks

- Demo jobs, decisions and version changes are simulated. The synthetic images and illustrative heatmap are fixtures, not ML results.
- The stored Playwright operator tests could not run on this restricted Mac: Chromium failed before creating a page due to a MachPort permission error. They are provided for a normal developer/CI environment, not reported as passing.
- No live FastAPI URL, agreed OpenAPI spec, real part dataset or AMD run artifact was supplied. Real persistence, inference, correction consumption and version restore remain unverified.
- Dockerfile is provided but a container build was not run here.
- Hosted demo (18 October 2026): https://web-production-d9743.up.railway.app runs in live mode against the FastAPI backend on Railway. Checked: `/health` reports the model loaded on CPU (`amd_gpu: false`) and the assistive report enabled via AMD Token Factory; the VisA pcb1 profile is ready and a saved inspection has a completed report.
- The presentation was rendered and checked as a PPTX package, not opened in native PowerPoint. The video is a silent sequence of actual UI captures with captions, not continuous live-inference footage.

## Live acceptance checklist

1. Confirm the proposed endpoint names, fields, statuses, image alignment and feedback/build semantics with the ML developer.
2. Configure live mode and the service URL. Set any credential as a server secret.
3. Load an empty profile library, create a profile and upload real known-good images.
4. Wait for a successful build and check the returned active version.
5. Inspect a new part, retrieve original/heatmap/reference and verify spatial alignment.
6. Confirm returned model decision and measured processing duration, or null when unreported.
7. Save a different human decision and reload the result to prove backend persistence without overwriting the model decision.
8. Request a supported update, reload the profile and inspect again. Check that old records retain their original version.
9. If supported, load actual history, compare measured values and restore a version. Otherwise retain Planned labels.
10. Exercise invalid files, processing failure, cancellation, timeout and unavailable service using a staging backend.
11. Deploy the Node web app to the intended host/network, configure server secrets and repeat the flow on that URL.
12. Record the real workflow with actual AMD/ROCm evidence before describing the submission as integrated.
