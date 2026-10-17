"""Build benchmark manifests from the VisA dataset's official 1-class split.

References are a fixed seeded sample of the split's train normals; the test set is the split's
full test set (normal + anomaly). Nothing here looks at scores, so test labels never tune anything.

VisA: https://github.com/amazon-science/spot-diff (CC BY 4.0, Amazon). Split file:
https://raw.githubusercontent.com/amazon-science/spot-diff/main/split_csv/1cls.csv
"""

import argparse
import csv
import json
import os
import random
from pathlib import Path

PCB = ["pcb1", "pcb2", "pcb3", "pcb4"]


def build(rows, category, visa_root: Path, out_dir: Path, references: int, seed: int):
    rows = [r for r in rows if r["object"] == category]
    train = sorted(r["image"] for r in rows if r["split"] == "train" and r["label"] == "normal")
    test = sorted((r for r in rows if r["split"] == "test"), key=lambda r: r["image"])
    if not train or not test:
        raise ValueError(f"No rows for category {category!r}")
    chosen = sorted(random.Random(f"{seed}:{category}").sample(train, references))

    def rel(path):
        target = visa_root / path
        if not target.is_file():
            raise FileNotFoundError(target)
        return os.path.relpath(target, out_dir)

    return {
        "name": f"visa-{category}",
        "dataset_kind": "real_industrial",
        "source": "VisA (Zou et al., ECCV 2022), Amazon, CC BY 4.0, official 1cls split",
        "selection": f"{references} references sampled from train normals with seed {seed}",
        "references": [rel(p) for p in chosen],
        "test": [{"path": rel(r["image"]), "label": r["label"]} for r in test],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--visa-root", required=True, type=Path, help="Folder holding pcb1/, candle/, ...")
    parser.add_argument("--split", required=True, type=Path, help="Official split_csv/1cls.csv")
    parser.add_argument("--output", required=True, type=Path, help="Folder for <category>.json manifests")
    parser.add_argument("--categories", nargs="+", default=PCB)
    parser.add_argument("--references", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    with args.split.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    args.output.mkdir(parents=True, exist_ok=True)
    out_dir = args.output.resolve()
    for category in args.categories:
        manifest = build(rows, category, args.visa_root.resolve(), out_dir, args.references, args.seed)
        path = args.output / f"{category}.json"
        path.write_text(json.dumps(manifest, indent=2) + "\n")
        labels = [t["label"] for t in manifest["test"]]
        print(
            f"{path}: {len(manifest['references'])} references, "
            f"{labels.count('normal')} normal + {labels.count('anomaly')} anomaly test"
        )


if __name__ == "__main__":
    main()
