"""Design sweep on VisA development categories only; refuses PCB manifests (the final test).

Prints mean AUROC per variant and mean FPR / recall / F1 per leave-one-out threshold rule.

  python scripts/visa_manifest.py --visa-root data/datasets/visa \
    --split data/datasets/visa/split_csv/1cls.csv --output data/datasets/manifests-dev \
    --categories candle capsules cashew chewinggum fryum macaroni1 macaroni2 pipe_fryum
  python scripts/dev_sweep.py --manifests data/datasets/manifests-dev --device mps
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.metrics import f1_score, roc_auc_score
from worksight.detector import distances, make_bank
from worksight.encoder import VisualEncoder

VARIANTS = [
    {"size": 224, "per_image": 128, "score": "top1"},
    {"size": 224, "per_image": None, "score": "top1"},
    {"size": 224, "per_image": None, "score": "max"},
    {"size": 320, "per_image": None, "score": "top1"},
    {"size": 384, "per_image": None, "score": "top1"},
]
RULES = {
    "q95x1.2": lambda s: np.quantile(s, 0.95) * 1.2,
    "max": np.max,
    "mean+2sd": lambda s: np.mean(s) + 2 * np.std(s),
    "q95": lambda s: np.quantile(s, 0.95),
}


def score(patches, how):
    if how == "max":
        return float(patches.max())
    n = max(1, math.ceil(len(patches) * 0.01))
    return float(np.partition(patches, -n)[-n:].mean())


def load(path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((768, 768))
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifests", required=True, type=Path)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    paths = sorted(args.manifests.glob("*.json"))
    if not paths or any("pcb" in p.stem for p in paths):
        raise SystemExit("Provide only non-PCB development manifests")
    data = {}
    for path in paths:
        manifest = json.loads(path.read_text())
        refs = [load(path.parent / r) for r in manifest["references"]]
        tests = [(load(path.parent / t["path"]), t["label"] == "anomaly") for t in manifest["test"]]
        data[path.stem] = refs, tests
    encoders = {}
    for variant in VARIANTS:
        encoder = encoders.setdefault(
            variant["size"], VisualEncoder(args.device, image_size=variant["size"])
        )
        aurocs, by_rule = [], {rule: [] for rule in RULES}
        for refs, tests in data.values():
            features = [encoder.extract(r)[0] for r in refs]
            bank, owners = make_bank(features, variant["per_image"])
            loo = np.array([
                score(distances(f, bank[owners != i], encoder.device)[0], variant["score"])
                for i, f in enumerate(features)
            ])
            scores = np.array([
                score(distances(encoder.extract(im)[0], bank, encoder.device)[0], variant["score"])
                for im, _ in tests
            ])
            labels = np.array([anomaly for _, anomaly in tests])
            aurocs.append(roc_auc_score(labels, scores))
            for rule, fn in RULES.items():
                predicted = scores >= fn(loo)
                by_rule[rule].append(
                    (predicted[~labels].mean(), predicted[labels].mean(), f1_score(labels, predicted))
                )
        rules = "  ".join(
            f"{rule} {np.mean([v[0] for v in values]):.2f}/{np.mean([v[1] for v in values]):.2f}"
            f"/{np.mean([v[2] for v in values]):.2f}"
            for rule, values in by_rule.items()
        )
        print(f"{json.dumps(variant)}  AUROC {np.mean(aurocs):.3f}  FPR/recall/F1: {rules}", flush=True)


if __name__ == "__main__":
    main()
