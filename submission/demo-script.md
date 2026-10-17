# Worksight demo script (live site, 2–3 minutes)

Record the live site, https://web-production-d9743.up.railway.app, as one continuous screen recording
with voice. Export MP4 (lablab accepts MP4 or MOV, up to 300 MB, ideally under 5 minutes). Use a clean
browser window; never show Railway settings, keys or `.env`.

0:00 — Problem. “Every new part on a line usually needs a trained defect model and labelled defects.
Worksight starts from 10–20 photos of good parts instead.”

0:15 — Profile. Show **Ultrasonic sensor board (VisA pcb1)**: version 1, 20 reference photos, Ready.
“Building this profile took about nine seconds. No training.” Open Reference samples briefly.

0:35 — Inspect. Click **Bent pins**, then **Run inspection**. “The part is compared patch by patch
with the good references.” Show the Fail decision, anomaly score and threshold. Say once: “the score
is a distance, not a probability.”

0:55 — Evidence. Switch Heatmap / Original / Compare. “The heatmap sits on the pins, and the closest
good reference shows them straight.”

1:15 — AMD + Gemma. Click **Open saved inspection** (a completed description, so no waiting): read the
Gemma description and point at “Gemma-4-31B-IT · Runs on AMD Token Factory”. “Gemma on AMD explains
what looks wrong. It never changes the detector's decision.” Generating live is optional: Token Factory
sometimes falls back to DeepSeek.

1:35 — Engineer decides. Choose a human decision, add a note, save. “The model's decision and the
engineer's decision are stored separately.”

1:50 — Good part. Click **Good board**, run it, show a normal result.

2:05 — Numbers. Cut to a slide or README table: VisA PCB on CPU, held-out test — AUROC 0.88–0.99,
recall 44–87% at a 2–6% false-alarm rate, 0.1–0.3 s per inspection. If the AMD run is done, show its
GPU name and latency.

2:20 — Close. “Worksight: onboard a part from good photos, get a heatmap and an explanation, keep the
engineer in charge.”

Do not claim: detector inference on an AMD GPU (unless `scripts/amd_run.sh` ran), model training,
calibrated confidence, sensor monitoring or failure forecasting.
