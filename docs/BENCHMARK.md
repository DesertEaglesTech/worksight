# Real-data benchmark: VisA PCB

## Dataset

[VisA](https://github.com/amazon-science/spot-diff) (Zou et al., ECCV 2022), Amazon, **CC BY 4.0**.
The archive includes the license as `LICENSE-DATASET` and the official split `split_csv/1cls.csv`.
Categories: `pcb1`–`pcb4` (printed circuit boards).

Splits are fixed before any scoring:

- References: 20 images sampled from the official **train** normals, seed `0:<category>`
  (`scripts/visa_manifest.py`). The exact hashes are stored in each report as `reference_hashes`.
- Test: the full official **test** split, 100–101 normal and 100 anomaly images per category.
- Threshold: estimated from the references only (leave-one-reference-out, 95th percentile × 1.2).
  Test labels are not used for any choice.

## Results — CPU, 18 October 2026

Apple arm CPU, PyTorch 2.14.1, torchvision 0.29.1, encoder `resnet18-imagenet1k-v1-layer2-layer3-l2-resize224-v1`.
**This is not an AMD run.**

| Category | AUROC | F1 | False-positive rate | Recall | TP / FN / FP / TN | p50 / p95 latency, ms |
|---|---|---|---|---|---|---|
| pcb1 | 0.902 | 0.159 | 0.040 | 0.090 | 9 / 91 / 4 / 96 | 12.6 / 17.4 |
| pcb2 | 0.774 | 0.281 | 0.040 | 0.170 | 17 / 83 / 4 / 96 | 12.2 / 13.0 |
| pcb3 | 0.764 | 0.436 | 0.040 | 0.290 | 29 / 71 / 4 / 97 | 12.4 / 15.1 |
| pcb4 | 0.948 | 0.358 | 0.010 | 0.220 | 22 / 78 / 1 / 100 | 14.0 / 17.4 |

Latency is batch 1 with a warm encoder: preprocessing, encoding and retrieval. Disk, network and
heatmap are excluded. Onboarding of 20 references took 239–316 ms.

## Reading the results

- AUROC is threshold-free. It shows that the scores separate normal and defective boards
  reasonably well on pcb1 and pcb4, and weakly on pcb2 and pcb3.
- The reference-only threshold is **conservative**: false-positive rate is 1–4%, but recall is
  only 9–29%. Most defects score above normal on average but stay below the threshold.
  At this operating point the binary decision misses most defects. The API's ±10% `review` band
  catches some borderline cases, but it does not fix low recall.
- Do not lower the threshold by looking at these test results: that would turn the test into
  a tuning set. Changing the threshold rule needs a separate labelled validation set
  (the feedback flow already supports one), with this test kept untouched.
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
