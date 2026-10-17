# Real-data benchmark: VisA PCB

## Dataset

[VisA](https://github.com/amazon-science/spot-diff) (Zou et al., ECCV 2022), Amazon, **CC BY 4.0**.
The archive includes the license as `LICENSE-DATASET` and the official split `split_csv/1cls.csv`.

- **Final test categories:** `pcb1`–`pcb4` (printed circuit boards).
- **Development categories:** the other 8 VisA categories (candle, capsules, cashew, chewinggum,
  fryum, macaroni1, macaroni2, pipe_fryum). Every design choice below was made on these only.

Splits are fixed before any scoring:

- References: 20 images sampled from the official **train** normals, seed `0:<category>`
  (`scripts/visa_manifest.py`). The exact hashes are stored in each report as `reference_hashes`.
- Test: the full official **test** split, 100–101 normal and 100 anomaly images per PCB category.
- Threshold: estimated from the references only (leave-one-reference-out). PCB test labels are not
  used for any choice.

## Results — CPU, 18 October 2026 (current detector, v2)

Apple arm CPU, PyTorch 2.14.1, torchvision 0.29.1, encoder `resnet18-imagenet1k-v1-layer2-layer3-l2-resize384-v1`.
Same references as v1 (hashes checked). **This is not an AMD run.**

| Category | AUROC | F1 | False-positive rate | Recall | TP / FN / FP / TN | p50 / p95 latency, ms |
|---|---|---|---|---|---|---|
| pcb1 | 0.905 | 0.591 | 0.050 | 0.440 | 44 / 56 / 5 / 95 | 250 / 572 |
| pcb2 | 0.884 | 0.715 | 0.060 | 0.590 | 59 / 41 / 6 / 94 | 304 / 826 |
| pcb3 | 0.875 | 0.613 | 0.040 | 0.460 | 46 / 54 / 4 / 97 | 250 / 471 |
| pcb4 | 0.992 | 0.921 | 0.020 | 0.870 | 87 / 13 / 2 / 99 | 194 / 242 |

Latency is batch 1 with a warm encoder: preprocessing, encoding and retrieval on CPU. Disk, network
and heatmap are excluded. Onboarding of 20 references (features + leave-one-out threshold) took 5–9 s
on CPU. Both are expected to drop on an AMD GPU; that is not measured yet.

### Previous detector (v1), same references and test

Encoder `...-resize224-v1`, 128 sampled patches per reference, threshold q95 × 1.2.

| Category | AUROC | F1 | FPR | Recall | p50 ms |
|---|---|---|---|---|---|
| pcb1 | 0.902 | 0.159 | 0.040 | 0.090 | 12.6 |
| pcb2 | 0.774 | 0.281 | 0.040 | 0.170 | 12.2 |
| pcb3 | 0.764 | 0.436 | 0.040 | 0.290 | 12.4 |
| pcb4 | 0.948 | 0.358 | 0.010 | 0.220 | 14.0 |

## What changed and how it was chosen

Measured on the 8 development categories (`scripts/dev_sweep.py`, mean over categories):

| Variant | Dev AUROC |
|---|---|
| v1: 224 px, 128 sampled patches per reference | 0.806 |
| 224 px, all patches | 0.817 |
| 224 px, all patches, max instead of top-1% score | 0.813 |
| 320 px, all patches | 0.845 |
| **384 px, all patches (chosen)** | **0.862** |
| WideResNet-50, 256 px, all patches | 0.817 |

Threshold rules on the chosen variant (dev mean FPR / recall / F1): q95 × 1.2 (v1)
0.03 / 0.48 / 0.57; max 0.05 / 0.52 / 0.61; **mean + 2 sd (chosen) 0.06 / 0.59 / 0.67**;
q95 0.10 / 0.65 / 0.71. The chosen rule keeps false alarms near 5% on dev; q95 finds more defects
at about twice the false alarms. The PCB results above were computed once, after these choices.

Trade-offs: CPU inspection is ~20× slower than v1 (more patches at higher resolution), memory per
reference is ~6× larger (2304 patches × 384 dims), and profiles built with v1 must be rebuilt because
the encoder signature changed (the API returns 409 for them).

### What reaches the engineer (review band)

The binary table counts only `score >= threshold`. The product's decision has a ±10% `review` band
around the threshold (`review_margin` 0.1, fixed before the PCB test), and both `review` and
`anomaly` go to the engineer. Recounted from the same per-image scores in the CPU reports with
`python scripts/review_band.py data/evidence/visa-cpu/pcb*.json`; nothing re-run or tuned.

| Category | Defects: anomaly / review / normal | Recall, binary | Defects sent to engineer | Good boards sent to engineer |
|---|---|---|---|---|
| pcb1 | 35 / 21 / 44 | 44% | 56% | 7% |
| pcb2 | 44 / 33 / 23 | 59% | 77% | 13% |
| pcb3 | 37 / 21 / 42 | 46% | 58% | 10% |
| pcb4 | 74 / 22 / 4 | 87% | 96% | 4% |

This is the triage view: more defects reach a person, at the cost of more good boards to look at.
It is not a better detector; AUROC is unchanged.

### More references (measured after the design was fixed)

Same detector, same PCB test, 100 references instead of 20 (`--references 100`, same seed rule).
100 references exceed the memory cap, so each keeps an equal share of its patches. Not used to
choose anything.

| Category | References | AUROC | F1 | FPR | Recall |
|---|---|---|---|---|---|
| pcb1 | 20 → 100 | 0.905 → 0.907 | 0.591 → 0.789 | 0.050 → 0.090 | 0.440 → 0.710 |
| pcb3 | 20 → 100 | 0.875 → 0.913 | 0.613 → 0.547 | 0.040 → 0.010 | 0.460 → 0.380 |

AUROC improved on both; the threshold's operating point moved in opposite directions. More
references help separation, but the threshold still needs checking per part.

## Reading the results

- AUROC rose on all four boards, most on pcb2 and pcb3, which were weakest.
- Recall rose from 9–29% to 44–87% while the false-positive rate stayed at 2–6%. Roughly half the
  defects on pcb1 and pcb3 are still missed at this operating point. The API's ±10% `review` band
  routes borderline scores to the engineer: with it, 56–96% of defects and 4–13% of good boards
  reach a person (table above).
- Leave-one-out scores overstate normal scores because the scored reference is missing from memory;
  that is why the old q95 × 1.2 rule was too strict.
- Not a PatchCore reproduction. Do not compare these numbers with published PatchCore results on VisA.

## Reproduce

```bash
mkdir -p data/datasets/visa
curl -fL https://amazon-visual-anomaly.s3.us-west-2.amazonaws.com/VisA_20220922.tar | tar -x -C data/datasets/visa -f -
python scripts/visa_manifest.py --visa-root data/datasets/visa \
  --split data/datasets/visa/split_csv/1cls.csv --output data/datasets/manifests
export TORCH_HOME=./data/torch
for c in pcb1 pcb2 pcb3 pcb4; do
  python -m worksight.benchmark --manifest data/datasets/manifests/$c.json \
    --output data/evidence/visa-cpu/$c.json --device cpu
done
```

The archive is about 1.9 GB.

## AMD rerun

One command on the AMD machine (ROCm PyTorch and torchvision already installed):

```bash
git clone https://github.com/DesertEaglesTech/worksight.git && cd worksight
bash scripts/amd_run.sh
```

It stops unless PyTorch sees an AMD ROCm GPU, then installs the backend without replacing torch,
downloads VisA if needed, builds the same manifests, runs the HTTP smoke test and the benchmark with
`--require-amd`, and writes `environment.json`, `smoke/`, `<category>.json`, `summary.md` and
`run.log` to `data/evidence/visa-amd/`. Copy that folder back. Rehearse locally with
`DRY_RUN_CPU=1 CATEGORIES=pcb1 bash scripts/amd_run.sh` (writes to `work/`, never AMD evidence).

Manual equivalent:

On the AMD machine, with the vendor ROCm PyTorch already installed, run the same manifest
commands and then:

```bash
export TORCH_HOME=./data/torch
for c in pcb1 pcb2 pcb3 pcb4; do
  python -m worksight.benchmark --manifest data/datasets/manifests/$c.json \
    --output data/evidence/visa-amd/$c.json --device cuda --require-amd
done
```

Check that `reference_hashes` match the CPU reports, so both runs used the same references.
Scores should agree up to floating-point differences. Latency is the number that changes.
`runtime` in each report records the GPU name and the HIP version.
