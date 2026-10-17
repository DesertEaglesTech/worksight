# Implementation status — 17 October 2026

## Verified locally

- 14 automated tests pass: API lifecycle, persistence, normal/defect retrieval, threshold self-match
  exclusion, heatmap scaling, authentication, duplicate/split checks, candidate evaluation,
  successful activation/rollback, rejected regression, task failure and restart recovery.
- Ruff checks and Git whitespace checks pass.
- Real pretrained ResNet-18 smoke completed on **CPU / Apple arm**, PyTorch 2.14.1,
  torchvision 0.29.1. Ten synthetic reference images, two separate synthetic inspection fixtures.
  The normal fixture was classified normal and the scratch fixture anomalous. The overlay was
  visually inspected. This does not establish industrial accuracy.
- Benchmark CLI completed on synthetic fixtures; its metrics are pipeline checks, not submission results.
- Live local server at port 8000 responds to health, OpenAPI and Swagger docs. Model warmup succeeds.

## Pending external evidence

- AMD notebook/VM allocation and actual ROCm execution. The AMD AI Notebooks login page advertises
  GPU-powered Jupyter notebooks; the team's logged-in entitlement has not been verified.
- Real industrial dataset benchmark, separate held-out final test, false-positive analysis.
- Linux/ROCm container execution.
- Frontend integration and final demo recording (teammate's work).

## Next sequence

1. Sign into AMD AI Notebooks and confirm access to a custom Python/Jupyter GPU runtime.
2. Run the AMD verification and smoke commands in `docs/AMD_ACCESS.md`.
3. Obtain a properly licensed real industrial image set, fix splits, run the benchmark without test-set tuning.
4. Give the frontend teammate `docs/API.md`; integrate profile creation and inspection first.
5. Evaluate adaptation separately, preserving an untouched final test set.

Source changes remain local; no commit, push, public deployment or hackathon submission was performed.
