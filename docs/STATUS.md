# Implementation status — 18 October 2026

## Live

- Web: https://web-production-d9743.up.railway.app (Next.js, live mode).
- Backend: FastAPI + PyTorch on Railway CPU (8 vCPU budget), behind the web proxy with a server-side
  API key. `/health` reports `amd_gpu: false` until the model runs on an AMD GPU.
- A VisA pcb1 profile (20 references) is ready. "Good board" / "Bent pins" load two VisA test images;
  "Open saved inspection" shows a bent-pins result with a completed Gemma description.

## Verified

- Backend: 36 pytest tests and Ruff pass. Web: typecheck, 39 vitest tests and `next build` pass
  (Node 24). Playwright demo-mode e2e (2 tests) passes on Linux Chromium (Node 22); the two live
  e2e specs need a running backend and were skipped.
- Benchmark (CPU, VisA PCB, held-out test, design chosen on 8 other VisA categories):
  AUROC 0.88–0.99, recall 44–87% at FPR 2–6%. Details: [BENCHMARK.md](BENCHMARK.md).
- Live on Railway CPU: inspection 114–330 ms (`inference_ms`), 20-reference profile ~9 s.
  A 10-image batch (5 normal, 5 defective pcb1) flagged all 5 defects; one normal went to `review`.
  These are spot checks, not metrics.
- Clicked through the live site: Bent pins → Run inspection → Fail (score 0.279, threshold 0.094),
  heatmap on the pins, AI description returned.
- AI description: Gemma-4-31B-IT on AMD Token Factory answers most requests but returns HTTP 500 in
  short bursts (provider-side; earlier bodies said CUDA out of memory). Two retries (3 s, 6 s), then
  DeepSeek-V4.1-Flash. The report shows which model answered.

## Not done

- **Detector on an AMD GPU.** No GPU instance yet. `bash scripts/amd_run.sh` runs the smoke test and
  benchmark with `--require-amd` and saves GPU name, ROCm version, metrics and latency.
- Submission video in MP4 with the live flow and voice (current: silent WebM of the old synthetic
  demo). Slides and cover are done: `submission/worksight-pitch.pdf`, `submission/worksight-cover.png`.
- Sensor monitoring, failure forecasting and PDF specification extraction (planned, not built).

## Known limits

- One process, in-process job queue; a restart fails unfinished work with a clear reason.
- Threshold is a leave-one-out heuristic, not a calibrated probability; recall on pcb1/pcb3 is ~45%.
- Three leftover test profiles ("VisA pcb4 (live check)") remain on the hosted demo until
  `POST /api/v1/profiles/{id}/archive` is deployed and called with the API key (it hides a profile
  from the list; records stay readable).
