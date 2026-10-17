"""Re-reads benchmark reports and counts what the product sends to the engineer.

The binary benchmark counts only score >= threshold as a detection (the first two rate columns
match docs/BENCHMARK.md). The product also has a review band (±margin around the threshold, fixed
before the PCB test), and both `review` and `anomaly` reach the engineer. This uses the stored per-image scores and threshold; nothing is re-run or tuned.

  python scripts/review_band.py data/evidence/visa-cpu/pcb*.json
"""

import argparse
import json
from pathlib import Path

from worksight.detector import decision


def summarize(report: dict) -> dict:
    threshold = report["threshold"]["value"]
    margin = report["threshold"].get("review_margin", 0.1)
    counts = {label: {"normal": 0, "review": 0, "anomaly": 0} for label in ("normal", "anomaly")}
    for sample in report["samples"]:
        counts[sample["label"]][decision(sample["score"], threshold, margin)] += 1
    defects, normals = counts["anomaly"], counts["normal"]
    binary = {
        label: sum(s["score"] >= threshold for s in report["samples"] if s["label"] == label)
        for label in ("normal", "anomaly")
    }
    return {
        "dataset": report["dataset"],
        "margin": margin,
        "counts": counts,
        "recall_binary": binary["anomaly"] / sum(defects.values()),
        "fpr_binary": binary["normal"] / sum(normals.values()),
        "recall_anomaly_only": defects["anomaly"] / sum(defects.values()),
        "recall_to_engineer": (defects["anomaly"] + defects["review"]) / sum(defects.values()),
        "fpr_anomaly_only": normals["anomaly"] / sum(normals.values()),
        "normals_to_engineer": (normals["anomaly"] + normals["review"]) / sum(normals.values()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = parser.parse_args()
    rows = [summarize(json.loads(path.read_text())) for path in args.reports]
    if args.json:
        print(json.dumps(rows, indent=2))
        return
    print(
        "| Dataset | Defects: anomaly / review / normal | Recall (score >= threshold) | "
        "FPR (score >= threshold) | Recall (sent to engineer) | Normals sent to engineer |"
    )
    print("|---|---|---|---|---|---|")
    for r in rows:
        d = r["counts"]["anomaly"]
        print(
            f"| {r['dataset']} | {d['anomaly']} / {d['review']} / {d['normal']} | "
            f"{r['recall_binary']:.0%} | {r['fpr_binary']:.0%} | {r['recall_to_engineer']:.0%} | "
            f"{r['normals_to_engineer']:.0%} |"
        )


if __name__ == "__main__":
    main()
