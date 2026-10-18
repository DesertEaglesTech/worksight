# Worksight demo script (live site, 3½–4 minutes)

The lablab rubric scores a presentation video under 3 minutes as "Limited" and expects problem,
solution, value proposition, market, revenue and future plans in under 5 minutes. Aim for 3:30–4:30.

Record the live site, https://web-production-d9743.up.railway.app, plus slides from
`worksight-pitch.pdf`, as one screen recording with voice. Export MP4 (lablab accepts MP4 or MOV, up
to 300 MB, under 5 minutes). Use a clean browser window; never show Railway settings, keys or `.env`.

Before recording, hide the leftover test profiles so judges see one clean profile: after the backend
with `POST /api/v1/profiles/{id}/archive` is deployed, call it once per "VisA pcb4 (live check)"
profile with `Authorization: Bearer <WORKSIGHT_API_KEY>` (backend URL, not the web proxy).

0:00 — Problem (slides 1–2). “A quality engineer gets a new part on the line. A typical defect model
needs many labelled defect images and a training run, and defects are rare. Worksight starts from
10–20 photos of good parts instead.”

0:30 — Product (slide 3). “Four steps: onboard, inspect, explain, decide.”

0:45 — Profile (live). Show **Ultrasonic sensor board (VisA pcb1)**: version 1, 20 reference photos,
Ready. “Building this profile took about nine seconds. No training, no defect labels.” Open
Reference samples briefly.

1:05 — Inspect. Click **Bent pins**, then **Run inspection**. “The part is compared patch by patch
with the good references.” Show the Fail decision, anomaly score and threshold. Say once: “the score
is a distance, not a probability.”

1:25 — Evidence. Switch Heatmap / Original / Compare and zoom. “The heatmap sits on the pins, and the
closest good reference shows them straight.”

1:45 — AMD + Gemma. Click **Open saved inspection** (a completed description, so no waiting): read the
Gemma description and point at “Gemma-4-31B-IT · Runs on AMD Token Factory”. Say “Gemma” and “AMD”
out loud: this covers both the AMD requirement and the Google partner prize. “Gemma, running on AMD
GPUs through AMD Token Factory, sees the photo, the heatmap, the closest good reference and the part's
documentation, and explains what looks wrong and what to check. It never changes the detector's
decision.” Generating live is optional: Token Factory sometimes falls back to DeepSeek, and the video
should show Gemma.

2:15 — Engineer decides. Choose a human decision, add a note, save. “The model's decision and the
engineer's decision are stored separately.”

2:30 — Good part. Click **Good board**, run it, show a normal result.

2:45 — Safe updates. Open **Reference samples → Validation & versions** and show the panel without
applying anything. “Confirmed good parts build a new version. It goes live only if it adds no false
alarm or missed defect on a frozen validation set, and it can be rolled back.” (Slide 6 if the panel
is empty.)

3:05 — Numbers (slide 5). “On real circuit boards from the public VisA dataset, held-out test:
AUROC 0.88 to 0.99. Above the threshold alone we catch 44 to 87 percent of defects at 2 to 6 percent
false alarms; counting the review band, 56 to 96 percent of defects reach the engineer.” If the AMD
run is done, show its GPU name and latency.

3:25 — Market and business (slides 7–8). “The AI visual inspection market is forecast to grow by
about 27 billion dollars by 2029. Existing tools start from labelled defects or are code libraries;
Worksight starts from good photos and keeps the engineer in charge. The plan: a subscription per
camera view or on-premises on AMD hardware, a pilot on one line, the detector on AMD Instinct and an
edge station on Ryzen AI.”

3:55 — Close. “Worksight: onboard a part from good photos, get a heatmap and an explanation from Gemma
on AMD, keep the engineer in charge.”

Do not claim: detector inference on an AMD GPU (unless `scripts/amd_run.sh` ran), model training,
calibrated confidence, sensor monitoring or failure forecasting.
