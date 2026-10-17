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

## Assistive AI description integration — 18 October 2026

Verified on merged `main`, with backend source and demo implementation unchanged:

- Node 24: typecheck, 34 Vitest tests and production build passed. Seven report tests cover real
  response variants, routes, availability, errors/404, no automatic retries, inspection binding,
  read-only polling/abort/timeout, escaped output and proxy allowlisting.
- Browser: inspected public held-out VisA PCB1 `005.JPG`. Inspection
  `8897c2e0e37b4525b678e7a3f66d7aa6` returned Fail, score 0.1753, threshold 0.1431, CPU 34.696 ms.
- Explicitly clicked **Generate description**. Backend report
  `63cf39c4ab494974bcc4029c5d742e14` became ready. It reports `Gemma-4-31B-IT`, served model
  `self-dploy/Gemma-4-31B-IT`, AMD Token Factory, about 7 seconds and 1,144 tokens. The displayed
  model text describes a bent pin and suggests checking pin alignment. This is a model-generated
  observation, not independently measured defect accuracy.
- Navigated to Reference samples and back after submission. The panel loaded the same saved report
  without a new generation. **Check saved description** retained the same report ID. Detector
  decision/score/threshold and the unsaved engineer review stayed unchanged; review controls and
  navigation remained available during generation.
- At 390 × 844, document width was 375 px with scrollbar: no horizontal overflow. Reset viewport.
  Browser error/warning log was empty. Proof: ignored `web/test-results/ai-description-live.png`.
- The live Playwright scenario now has an explicit `WORKSIGHT_E2E_AI_REPORT=1` opt-in for hosted
  generation with public QA images, saved-report reuse and unchanged detector result. The CLI
  scenario was not run for this check; the real flow above was verified through browser controls.

The local detector still runs on CPU. Hosted report generation does not establish that the
detector ran on AMD. Presentation and video were not changed.

## Selected Engineering interface and theme — 18 October 2026

- Engineering is now the default at `/`; the comparison archive stays at `/designs`. Engineering
  styles were extracted to a shared stylesheet so the production view does not load other designs.
- Removed the Model result top accent rule. Browser computed border-top was 0 px. The review
  sidebar has `max-height: none` and visible overflow; its client and scroll heights both measured
  1,169 px in the inspected desktop layout. The document scrolls as one page.
- Real public VisA `005.JPG` inspection `9cfcfce4afd140268ed461da6c69a1b5` was used for UI QA.
  Switching light/dark kept the same record, original and heatmap URLs and unsaved engineer note.
  The image's computed CSS filter stayed `none`. The QA note was cleared without being submitted.
- Dark preference survived a full reload and was server rendered from the display-only
  `worksight_theme` cookie. Both theme buttons, mobile navigation, reference library and the
  unsent new-profile dialog were checked. No new profile or engineer review was saved.
- At 390 × 844, document width was 375 px with scrollbar, with an accessible theme button and no
  horizontal overflow. Temporary viewport override was reset. Browser warning/error log was empty.
- Node 24 typecheck, 34 Vitest tests, production build and diff whitespace checks passed.
  Backend source and submission materials were not changed.

## Engineering review and comparison refinement — 18 October 2026

- Model result now leads directly into Engineer review and Save; Image display and Inspection
  details are collapsed below them. Technical timing, runtime and threshold explanations are in
  details. The review sidebar still uses document scrolling (755 px client and scroll heights,
  visible overflow in the inspected desktop case). Fail is 26 px; score and threshold are 20 px.
  Engineering uses Arial/Helvetica throughout, including numeric metadata. Theme buttons have
  icons and accessible labels without visible text.
- Compare expands to the full workspace. Both frames measured 533 × 406 px for the real
  1404 × 1070 image. Zoom to 125% and dragging the reference produced identical transforms on
  both images (`translate(40px, 25px) scale(1.25)`). Fit reset the transform. Opacity controls
  correctly changed only the overlay; images retained `filter: none` in both themes.
- Created the real backend profile `PCB module · top view` from 20 public VisA normal images.
  Saved anomalous inspection `99b61f8db15a4d77b3e3152f37c76194` and explicitly generated real
  AMD Token Factory report `68d948fe33dd408187777876105628ee` (Gemma-4-31B-IT). The report
  describes the bent pin. No engineer label was submitted for this example. Existing QA profiles,
  notes and versions were preserved. Notes appear under Review details in the reference selector.
- The optional server-configured Open saved inspection button reads the real record and completed
  report. No generation occurs on open. Unit coverage rejects missing, unfinished, failed or
  mismatched reports, passes abort signals and does not retry or call report generation on errors.
  The near-result AI description link scrolls to and focuses the report panel.
- Profile updates show a compact five-action sequence while preserving validation freeze,
  eligibility, evaluation gates and activation rules. Known example provenance appears in profile
  information and inspection details. Backend does not yet offer rename/persisted provenance.
- The standalone startup wrapper now loads web-root server env with @next/env, matching Next.js
  precedence. Verified npm start without shell-supplied mode/API/example configuration. Env files
  remain ignored; no secrets were added to the client bundle or repository.
- At 390 × 844, document width was 375 px and comparison frames stacked at 341 × 260 px.
  Mobile navigation, profile workflow, theme labels, preserved unsaved engineer input and
  unchanged saved report were checked. Temporary viewport override was reset.
- Node 24.16.0: typecheck, 37 Vitest tests and production build passed. Browser operator checks
  used the real local backend; Playwright specs were updated but were not run through the CLI.
  Backend source and presentation/video materials were not changed.

## Left navigation and bold headings — 18 October 2026

- Engineering desktop navigation moved from the top bar to a fixed dark left sidebar. It uses
  224 px normally, 216 px on medium desktops and a 72 px optional collapsed rail. Profile and
  theme controls stay in the sidebar; mobile retains its dismissible drawer and header toggle.
- Page, model/review, image, report and dialog headings use 700 weight in the same sans-serif
  family. Body text and measured values retain their existing weights.
- Browser check at the default desktop size: navigation x=0, main x=216, no horizontal overflow.
  Collapse changed main x to 72 and preserved the current inspection and unsaved engineer note.
  All inspected h1/h2/h3 headings computed to 700. The test note was cleared without submission.
- Typecheck, 37 unit tests and production build passed. No backend or record changes.

## Original published appearance restored — 18 October 2026

- Compared the published Railway page in the browser and restored its original base design:
  white left navigation, light grey workspace, orange primary actions, Arial typography and
  soft corners. `/` now uses `design="current"`; Engineering and other alternatives remain in
  `/designs`. No backend or data rollback was performed.
- Preserved the added review ordering, normal document scrolling, score/threshold, collapsed
  details, synchronized Compare, profile-update sequence, saved-inspection loader and real AI
  report. These refinements are scoped in original.css, separate from the archived Engineering CSS.
- Added an icon-only theme switch at the right of the desktop page heading and in the mobile
  header. Both themes use the same current inspection and engineer inputs. Browser check retained
  the saved report ID and test note; image filters stayed none. The note was cleared without
  submitting feedback. Dark preference also survived a reload.
- Verified the real saved inspection and AMD Token Factory report in both themes. Compare frames
  measured 427 × 325 px at the default desktop size, with equal scale(1.25) transforms. At 390 px,
  frames stacked, document width stayed 375 px, the theme icon appeared once in the mobile header
  and the navigation drawer worked. The temporary viewport was reset.
- Desktop heading action buttons now share one row, with the theme icon at x=1053 at the checked
  default size. No horizontal overflow or browser warning/error logs. Typecheck, 37 Vitest tests
  and production build passed. Local final build runs on port 3101; Railway was only inspected.
