import numpy as np
from sklearn.metrics import f1_score, roc_auc_score


def metrics(labels: list[int], scores: list[float], threshold: float) -> dict:
    y = np.asarray(labels)
    score = np.asarray(scores)
    prediction = score >= threshold
    tp = int(((y == 1) & prediction).sum())
    fn = int(((y == 1) & ~prediction).sum())
    fp = int(((y == 0) & prediction).sum())
    tn = int(((y == 0) & ~prediction).sum())
    return {
        "count": len(labels),
        "normal_count": int((y == 0).sum()),
        "anomaly_count": int((y == 1).sum()),
        "auroc": float(roc_auc_score(y, score)) if len(np.unique(y)) == 2 else None,
        "f1": float(f1_score(y, prediction, zero_division=0)),
        "false_positive_rate": fp / (fp + tn) if fp + tn else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "true_positive": tp,
        "false_negative": fn,
        "false_positive": fp,
        "true_negative": tn,
        "threshold": threshold,
        "decision_rule": "score >= threshold; review band excluded from binary benchmark",
    }


def promotion_gate(baseline: dict, candidate: dict) -> dict:
    passed = (
        candidate["false_positive"] <= baseline["false_positive"]
        and candidate["false_negative"] <= baseline["false_negative"]
    )
    return {
        "passed": passed,
        "rule": "no additional false positives or false negatives on the same validation set",
        "improved": passed
        and (
            candidate["false_positive"] < baseline["false_positive"]
            or candidate["false_negative"] < baseline["false_negative"]
        ),
    }
