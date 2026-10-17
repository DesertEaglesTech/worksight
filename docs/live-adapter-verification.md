# Live web adapter verification — 18 October 2026

Branch: `web-backend-adapter`. Backend source was not modified.
Node 24.16.0; Next.js 16.4.2. Local web: `http://127.0.0.1:3101` in live mode;
FastAPI: `http://127.0.0.1:8000` with a real pretrained ResNet-18 on Apple arm CPU,
PyTorch 2.14.1 / torchvision 0.29.1. No AMD execution is claimed.

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: 27 tests passed, including response mapping, offset and microsecond timestamps,
  immutable-feedback conflict handling, transient drafts, one multipart creation request, real
  inspection/update/activation paths, historical evaluation comparisons, 16 MP rejection,
  strict asset allowlist, Bearer-protected image proxy, error sanitization, and standalone Host/Origin.
- `npm run build`: production build passed.
- `npm run contract:export`: archived proposal schemas regenerate on Node 24.
- `git diff --check`: passed; `git diff main -- backend/` is empty.

The demo Playwright scenario was retained with a mode guard. A separate real-data live scenario
was added in `web/tests/e2e/live.spec.ts`. Playwright CLI was not run for this verification;
the real browser workflow below was driven and checked through Codex's browser controls.

## Real browser workflow

Source: official Amazon VisA PCB1 images and official `1cls.csv`, CC BY 4.0:
https://github.com/amazon-science/spot-diff . Only a 38-image subset was saved locally.
Twenty distinct references came from the official train-normal split. Inspection/feedback images
and the separate 5-normal + 5-anomaly validation images came from disjoint test images.
This small set is integration QA, not a new benchmark, threshold tuning or final quality estimate.
The original benchmark report in `BENCHMARK.md` remains separate.

Verified in the browser:

1. Create an unsent draft; stage 20 real images; build sends one multipart request. Profile ID
   `bf0af62f63f642a78b6b8c4270a95f94` is persisted by FastAPI. Reload retains it and its 20 references.
2. Inspect a held-out normal image. Original, transparent heatmap and nearest reference all load
   through the proxy. UI displays actual anomaly score, threshold, inference time and CPU runtime.
3. Save Pass engineer feedback. Saved controls lock, the backend note is retained, and the original
   model decision stays separate. Inspect a held-out anomalous image and save Fail feedback.
4. Upload and freeze a distinct 5+5 validation set with explicit acknowledgement. Only the normal
   feedback appears in candidate selection. Build v2: 21 references, still inactive until approved.
5. Evaluate v2, load report `45512151aedf4ad8942eeedc74f0945e`. Actual gate: passed=true,
   improved=false. UI says **Passed · no regression on validation**. On this ten-image validation
   set, baseline and candidate both have 0 false positives and 2 missed defects. No improvement
   or final test accuracy is claimed.
6. Apply v2 through the real activate endpoint. Old inspection continues to show v1; a new
   inspection returns v2. Restore approved v1, then restore approved v2. Reload the stored report.
7. Inspect an existing reference image: the backend's `matches_reference_image` warning appears.
8. Inspect another independent normal image. Mobile inspection and profile/version screens at
   390 × 844 have no horizontal page overflow (content width 375 with scrollbar). Viewport reset.
9. A conflicting real feedback POST returns 409 and does not replace the saved label.

The final persisted state has two approved versions, active v2, five inspections and two reviews.
Actual payloads are saved locally in ignored `work/live-qa/result.json`; fixture paths in
`work/live-qa/visa-files.json`. PNG proofs are in ignored `web/test-results/live-pcb-*.png`.

## Limits and remaining work

- The anomalous inspection `000.JPG` was classified Pass by the current model: score about 0.1261,
  threshold about 0.1431. The UI faithfully shows this and the engineer's separate Fail. A working
  integration does not establish production defect-detection quality.
- AMD/ROCm execution and GPU performance remain unverified. There is no AMD badge on this CPU run.
- Description persistence, validation-set readback, activation timestamps/audit reads, mutation
  idempotency/job recovery and manual feedback-conflict resolution are requests to ML in
  `api-contract.md`. No backend workarounds or separate durable profile storage were added.
- Demo fixtures are unchanged and remain disposable; history/evaluation/restore stay Planned there.
- Direct camera ingestion, auth, billing, chat and sensor monitoring were not introduced.

## Re-run

Start the unchanged backend as described in README. Configure `web/.env.local` with explicit live
mode and backend origin, then start the web app. The real-data browser test can use an image-path
manifest `{references: string[], normal: string[], anomaly: string[]}` (all absolute paths):

```bash
cd web
WORKSIGHT_E2E_MODE=live WORKSIGHT_E2E_PORT=3101 \
  WORKSIGHT_E2E_IMAGES=../work/live-qa/visa-files.json npm run test:e2e
```

Use a dedicated local QA profile; the scenario saves profiles, reviews and version activations.
It never deletes backend records or substitutes a fake encoder.
