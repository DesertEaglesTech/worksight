# Worksight — submission draft

Status: draft. The current demonstrable artifact is a synthetic UI workflow. Real AMD inference and end-to-end service validation are pending the ML backend. Replace this status only after recording a real run.

## Short description

Worksight helps quality engineers inspect industrial parts against known-good reference images. Operators create a part profile, upload a new image and review a heatmap alongside a similar reference. Engineer confirmation stays separate from the model decision, so corrections remain visible as the profile evolves.

## Problem

An inspection result needs context: which reference set was used, where the unusual region is and whether an engineer agrees with the decision. Switching between disconnected tools makes that review difficult to follow.

## Product

The web workspace keeps the inspection image, heatmap and reference comparison together. Upload previews help operators catch the wrong image before submission. Asynchronous jobs show the status actually reported by the service. Results preserve their profile version. Engineer feedback records an independent human decision and note.

## Implementation

Next.js, TypeScript and Tailwind CSS provide the English operator interface. A shared typed client validates API responses. A same-origin server proxy keeps backend credentials on the server. FastAPI owns durable profiles, uploads, jobs and results. The frontend includes no competing profile store.

The explicit demo adapter uses generated steel-flange images, an illustrative heatmap and simulated jobs. It returns a fixed result regardless of the upload. It is a UI demonstration, not evidence of defect detection or training.

## AMD implementation — awaiting backend evidence

The intended ML path belongs to the backend developer. Before submission, document the actual AMD accelerator model, ROCm version, model/feature extractor, commands and a successful inference artifact. Include actual processing duration if the service measured it. No hardware acceleration, accuracy or speed claim is made by this draft.

## Current scope

Implemented web flow: profile creation, good-sample upload and preview, build polling, inspection, heatmap opacity and reference comparison, independent engineer review, update request and repeat inspection by profile version. Optional version history, metric comparison and restore render only when the backend advertises them.

## Remaining integration work

Confirm the proposed OpenAPI contract with the ML developer, connect the live service and validate one real run from sample upload through inspection and correction. Record actual AMD evidence and replace the synthetic walkthrough with a real-backend recording before claiming an integrated AMD submission.

## Links to fill at submission

- Source: https://github.com/DesertEaglesTech/worksight
- Hosted demo: see deployment status in `docs/verification.md`.
- Demo walkthrough: `submission/worksight-demo.webm` (silent sequence of actual UI captures with SRT captions, synthetic data).
- Slides: `submission/worksight-pitch.pptx` when generated.
