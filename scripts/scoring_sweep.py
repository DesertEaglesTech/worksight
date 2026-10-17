"""Scoring sweep on VisA development categories only; refuses PCB manifests (the final test).

Encodes every image once with the production encoder (ResNet-18, 384 px), then compares ways of
turning patch distances into an image score, plus reference augmentation:

- k: mean distance to the k nearest reference patches (k=1 is the current detector)
- sigma: Gaussian smoothing of the patch-score map, in patch units (0 = none, current)
- aug: extra reference views (small rotations with a crop that hides the borders, small shifts).
  No flips: a mirrored board is not a valid good board.

Selection rule, fixed before running: highest mean dev AUROC; a variant within 0.003 of the best
that is simpler (no augmentation, smaller k, smaller sigma) wins. Recall / FPR are printed for the
leave-one-out threshold rules but are not used to choose. PCB categories are scored once afterwards
with worksight.benchmark.

  python scripts/scoring_sweep.py --manifests data/datasets/manifests-dev --device cpu
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps
from sklearn.metrics import roc_auc_score
from worksight.encoder import VisualEncoder

KS = (1, 3)
SIGMAS = (0, 0.5, 1, 2)
AUGS = {
    "none": (),
    "rot5": (("rot", 5), ("rot", -5)),
    "shift": (("shift", 0.04, 0), ("shift", -0.04, 0), ("shift", 0, 0.04), ("shift", 0, -0.04)),
}
RULES = {
    "mean+2sd": lambda s: np.mean(s) + 2 * np.std(s),
    "q95": lambda s: np.quantile(s, 0.95),
}


def load(path):
    with Image.open(path) as source:
        return ImageOps.exif_transpose(source).convert("RGB")


def augment(image, op):
    w, h = image.size
    if op[0] == "rot":
        # Crop the central region a rotation keeps filled, then restore the size.
        angle = math.radians(abs(op[1]))
        keep = 1 / (math.cos(angle) + math.sin(angle))
        rotated = image.rotate(op[1], resample=Image.Resampling.BICUBIC)
        cw, ch = w * keep, h * keep
        box = ((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2)
        return rotated.crop(box).resize((w, h), Image.Resampling.BICUBIC)
    _, dx, dy = op
    keep = 1 - 2 * max(abs(dx), abs(dy))
    cw, ch = w * keep, h * keep
    left = (w - cw) / 2 + dx * w
    top = (h - ch) / 2 + dy * h
    return image.crop((left, top, left + cw, top + ch)).resize((w, h), Image.Resampling.BICUBIC)


def gaussian(grid_scores: torch.Tensor, sigma: float) -> torch.Tensor:
    if not sigma:
        return grid_scores
    radius = max(1, math.ceil(3 * sigma))
    x = torch.arange(-radius, radius + 1, dtype=grid_scores.dtype)
    kernel = torch.exp(-(x**2) / (2 * sigma**2))
    kernel = kernel / kernel.sum()
    s = grid_scores[None, None]
    s = F.conv2d(F.pad(s, (radius, radius, 0, 0), mode="reflect"), kernel.view(1, 1, 1, -1))
    s = F.conv2d(F.pad(s, (0, 0, radius, radius), mode="reflect"), kernel.view(1, 1, -1, 1))
    return s[0, 0]


def top1(scores: torch.Tensor) -> float:
    flat = scores.flatten()
    n = max(1, math.ceil(len(flat) * 0.01))
    return float(flat.topk(n).values.mean())


@torch.inference_mode()
def knn(features: np.ndarray, bank: torch.Tensor, k: int) -> torch.Tensor:
    """Cosine distances to the k nearest bank patches, shape (patches, k), ascending."""
    out = []
    for batch in np.array_split(features, max(1, math.ceil(len(features) / 256))):
        sim = torch.from_numpy(batch).to(bank.device) @ bank.T
        out.append((1 - sim.topk(k, dim=1).values).clamp(0, 2).cpu())
    return torch.cat(out)


def image_scores(dist: torch.Tensor, grid, k: int, sigmas) -> dict:
    base = dist[:, :k].mean(dim=1).reshape(grid)
    return {sigma: top1(gaussian(base, sigma)) for sigma in sigmas}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifests", required=True, type=Path)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--augs", nargs="+", default=list(AUGS), choices=list(AUGS))
    parser.add_argument("--output", type=Path, help="optional JSON with per-category results")
    args = parser.parse_args()
    paths = sorted(args.manifests.glob("*.json"))
    if not paths or any("pcb" in p.stem for p in paths):
        raise SystemExit("Provide only non-PCB development manifests")
    encoder = VisualEncoder(args.device)
    kmax = max(KS)
    # results[(aug, k, sigma)][category] = (auroc, {rule: (fpr, recall)})
    results: dict = {}
    for path in paths:
        manifest = json.loads(path.read_text())
        refs = [load(path.parent / r) for r in manifest["references"]]
        test_feats, labels, grid = [], [], None
        for item in manifest["test"]:
            feats, grid = encoder.extract(load(path.parent / item["path"]))
            test_feats.append(feats)
            labels.append(item["label"] == "anomaly")
        labels = np.array(labels)
        for aug in args.augs:
            ref_feats, owners = [], []
            for i, image in enumerate(refs):
                for view in (image, *(augment(image, op) for op in AUGS[aug])):
                    feats, _ = encoder.extract(view)
                    ref_feats.append(feats)
                    owners.append(np.full(len(feats), i, dtype=np.int32))
            bank_np = np.concatenate(ref_feats)
            owners = np.concatenate(owners)
            bank = torch.from_numpy(bank_np).to(encoder.device)
            loo = {}  # (k, sigma) -> list of leave-one-reference-out scores
            originals = [ref_feats[i * (1 + len(AUGS[aug]))] for i in range(len(refs))]
            for i, feats in enumerate(originals):
                d = knn(feats, bank[torch.from_numpy(owners != i).to(encoder.device)], kmax)
                for k in KS:
                    for sigma, s in image_scores(d, grid, k, SIGMAS).items():
                        loo.setdefault((k, sigma), []).append(s)
            test = {}
            for feats in test_feats:
                d = knn(feats, bank, kmax)
                for k in KS:
                    for sigma, s in image_scores(d, grid, k, SIGMAS).items():
                        test.setdefault((k, sigma), []).append(s)
            for (k, sigma), scores in test.items():
                scores = np.array(scores)
                rules = {}
                for rule, fn in RULES.items():
                    predicted = scores >= fn(np.array(loo[(k, sigma)]))
                    rules[rule] = (
                        float(predicted[~labels].mean()),
                        float(predicted[labels].mean()),
                    )
                results.setdefault((aug, k, sigma), {})[path.stem] = (
                    float(roc_auc_score(labels, scores)),
                    rules,
                )
            print(f"{path.stem}: {aug} done", flush=True)
    rows = []
    for (aug, k, sigma), by_cat in results.items():
        aurocs = [v[0] for v in by_cat.values()]
        rule_means = {
            rule: tuple(float(np.mean([v[1][rule][j] for v in by_cat.values()])) for j in (0, 1))
            for rule in RULES
        }
        rows.append(
            {
                "aug": aug,
                "k": k,
                "sigma": sigma,
                "dev_auroc": float(np.mean(aurocs)),
                "rules_fpr_recall": rule_means,
                "per_category_auroc": {c: v[0] for c, v in by_cat.items()},
            }
        )
    rows.sort(key=lambda r: -r["dev_auroc"])
    best = rows[0]["dev_auroc"]
    simple = sorted(
        (r for r in rows if r["dev_auroc"] >= best - 0.003),
        key=lambda r: (r["aug"] != "none", r["k"], r["sigma"]),
    )[0]
    print("| aug | k | sigma | dev AUROC | mean+2sd FPR / recall | q95 FPR / recall |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        m, q = r["rules_fpr_recall"]["mean+2sd"], r["rules_fpr_recall"]["q95"]
        print(
            f"| {r['aug']} | {r['k']} | {r['sigma']} | {r['dev_auroc']:.3f} | "
            f"{m[0]:.2f} / {m[1]:.2f} | {q[0]:.2f} / {q[1]:.2f} |"
        )
    print(
        f"Selected by the fixed rule: {json.dumps({k: simple[k] for k in ('aug', 'k', 'sigma')})}"
    )
    if args.output:
        args.output.write_text(json.dumps({"rows": rows, "selected": simple}, indent=2) + "\n")


if __name__ == "__main__":
    main()
