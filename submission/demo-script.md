# Worksight demo script

Current recording: a silent sequence assembled from actual UI captures, using synthetic data. It demonstrates product behavior. It is not continuous screen footage and does not show live FastAPI inference, ROCm execution, trained profile improvement or a measured GPU benchmark.

## Spoken script for the final live demonstration

0:00 — “Worksight is an industrial visual inspection workspace. A quality engineer starts by defining a part and camera view.” Create `Bearing housing · top view`.

0:15 — “These are parts we have checked as acceptable. We upload them as the reference set and ask the service to prepare the profile.” Show upload previews and build status. For a live recording, use actual good samples.

0:35 — “Now we inspect a new part using that profile.” Upload a test image. Show the backend job state without invented progress.

0:50 — “The original image stays visible under the heatmap. Opacity makes it easier to see the surface. Compare shows the similar reference beside it.” Adjust opacity, show Original, then Compare.

1:10 — “The model decision and engineer confirmation are separate records. I can reject this part and explain the visible defect without rewriting what the model predicted.” Save a human decision and note.

1:30 — “When the backend supports corrections, we request a new profile version. The earlier inspection still refers to its original version.” Request update, show the returned version, inspect again and show the new result version. Do not claim improved accuracy unless independently measured.

1:50 — “This is the quality engineer's review loop. The backend owns the durable records and inference, and the web interface keeps the evidence and human decision together.”

## Before recording with the real service

- Get contract approval and configure live mode using server secrets.
- Verify real image provenance and permission to include it in submission materials.
- Obtain actual AMD hardware/model/ROCm execution evidence from the ML developer.
- Test the full flow including feedback and update support.
- Preserve the backend's measured processing time. If absent, show “not reported”.
- Leave unavailable versions/comparison/restore labelled Planned.
- Use a clean workspace, hide credentials and do not record server secret settings.
