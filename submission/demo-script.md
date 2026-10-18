# Worksight demo script (live site, about 4 minutes)

Timing follows lablab's "How to Win an AI Hackathon" guide: problem 0:00–0:30, live demo
0:30–2:30, business case 2:30–4:00, team and roadmap last. The rule book scores a video under
3 minutes as "Limited"; stay under 5 minutes. The speaker notes of each slide in the Slides deck hold
the same lines.

Record the live site, https://web-production-d9743.up.railway.app, plus slides from the deck, as one
screen recording with voice. Export MP4 (lablab accepts MP4 or MOV, up to 300 MB). Use a clean
browser window; never show Railway settings, keys or `.env`.

Before recording, hide the leftover test profiles so judges see one clean profile: after the backend
with `POST /api/v1/profiles/{id}/archive` is deployed, call it once per "VisA pcb4 (live check)"
profile with `Authorization: Bearer <WORKSIGHT_API_KEY>` (backend URL, not the web proxy).

## 0:00–0:30 — Problem (slides 1–2)

“A quality engineer gets a new part on the line. A typical defect model needs many labelled defect
images and a training run, and defects are rare. Worksight starts from photos of good parts instead.”

## 0:30–2:30 — Live demo

0:30 — Insight (slide 3), then open the live site in a fresh browser window: the welcome screen
explains Worksight in three steps; pick a language to show it (English, Italiano, Deutsch, Français,
中文, हिन्दी), switch back to English and click **Continue as guest**. Point at **How it works** and the
profile figures: “Twenty good boards, about nine seconds to build, no defect labels, no training.”

0:50 — Inspect. In **Try it in one click**, click **Inspect a defective board**. Show Fail, the
anomaly score and the threshold. Say once: “the score is a distance, not a probability.”

1:10 — Evidence. Switch Heatmap / Original / Compare and zoom. “The heatmap sits on the pins; the
closest good reference shows them straight.”

1:30 — Gemma on AMD. Click **Open saved inspection** (a completed description, no waiting) and read
the answer next to “Gemma-4-31B-IT · Runs on AMD Token Factory”. Say “Gemma” and “AMD” out loud: this
is the AMD requirement and the Google partner prize. “Gemma, running on AMD GPUs through AMD Token
Factory, sees the photo, the heatmap, the closest good reference and the part's documentation, and
explains what looks wrong and what to check. It never changes the detector's decision.” Generating
live is optional: Token Factory sometimes falls back to DeepSeek, and the video should show Gemma.

1:55 — Engineer decides. Choose a human decision, add a note, save. “The model's decision and the
engineer's decision are stored separately.” Then **New image** → **Inspect a good board** → normal result.

2:05 — Profile tools, under the result: **History** (reopen a past inspection), **Batch inspection**
(choose both example photos or a folder → ranked by anomaly score), **Part documents** (the part's
spec that Gemma reads).

2:20 — Safe updates. Open **Reference samples → Validation & versions** without applying anything
(slide 6 if the panel is empty). “A new version goes live only if it adds no false alarm or missed
defect on a frozen validation set, and it can be rolled back.”

## 2:30–4:00 — Proof and business (slides 7–10)

2:30 — Results (slide 7). “On four real circuit-board sets from the public VisA dataset, held-out
test: above the threshold alone we catch 44 to 87 percent of defects at 2 to 6 percent false alarms;
counting the review band, 56 to 96 percent of defects reach the engineer, who sees 4 to 13 percent of
good boards. 0.1 to 0.3 seconds per inspection on CPU.”

2:55 — Why AI and where AMD runs (slide 8). “Learning from twenty good photos is only possible
because a pretrained vision model already knows what images look like, and explaining a defect in
plain words needs a vision-language model: Gemma on AMD. Next, the detector itself moves to AMD
Instinct; the script is ready.” If `scripts/amd_run.sh` ran, show its GPU name and latency.

3:15 — Market (slide 9). “Technavio forecasts the AI visual inspection market to grow by about
27 billion dollars by 2029. Most tools start from labelled defects or are code libraries; Worksight
starts from good photos and gives the operator a workspace.”

3:40 — Plan and team (slide 10). “A subscription per camera view, or on-premises on AMD hardware; a
pilot on one line that measures engineer minutes per part and escaped defects. We are Desert Eagles:
Bakhtiyar, CEO and AI engineer, and Ali, frontend developer. Try Worksight at the link on screen.”

Do not claim: detector inference on an AMD GPU (unless `scripts/amd_run.sh` ran), model training,
calibrated confidence, sensor monitoring or failure forecasting.
