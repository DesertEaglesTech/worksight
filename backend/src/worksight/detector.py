"""PatchCore-inspired baseline; deterministic sampling, not the published coreset algorithm."""

import math

import numpy as np
import torch
from PIL import Image


def make_bank(
    features: list[np.ndarray], per_image: int | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """All reference patches by default; sampling left gaps that read as anomalies."""
    banks, owners = [], []
    for i, patches in enumerate(features):
        indices = (
            np.arange(len(patches))
            if per_image is None or per_image >= len(patches)
            else np.random.default_rng(42 + i).choice(len(patches), per_image, replace=False)
        )
        banks.append(patches[indices])
        owners.append(np.full(len(indices), i, dtype=np.int32))
    return np.concatenate(banks), np.concatenate(owners)


@torch.inference_mode()
def distances(
    features: np.ndarray, bank: np.ndarray, device="cpu"
) -> tuple[np.ndarray, np.ndarray]:
    """Bounded cosine distance. Both encoder and retrieval execute on the selected device."""
    if not len(bank):
        raise ValueError("Empty reference memory")
    memory = torch.from_numpy(bank).to(device)
    values, matches = [], []
    for batch in np.array_split(features, max(1, math.ceil(len(features) / 256))):
        query = torch.from_numpy(batch).to(device)
        similarity, indices = (query @ memory.T).max(dim=1)
        values.append((1 - similarity).clamp(0, 2).cpu().numpy())
        matches.append(indices.cpu().numpy())
    return np.concatenate(values), np.concatenate(matches)


def image_score(patch_scores: np.ndarray) -> float:
    # Mean of the top 1% is less sensitive to a single noisy patch than max.
    n = max(1, math.ceil(len(patch_scores) * 0.01))
    return float(np.partition(patch_scores, -n)[-n:].mean())


def per_image_for_cap(features: list[np.ndarray], cap: int, per_image: int | None = None):
    """Keep every patch while the bank fits the cap; otherwise an equal share per reference."""
    total = sum(len(f) for f in features)
    if total <= cap:
        return per_image
    share = max(1, cap // len(features))
    return share if per_image is None else min(per_image, share)


def estimate_threshold(
    features: list[np.ndarray],
    bank: np.ndarray,
    owners: np.ndarray,
    device="cpu",
    sample: int | None = None,
) -> dict:
    # Exclude ALL patches of the scored reference, avoiding self-match leakage.
    indices = list(range(len(features)))
    if sample and len(indices) > sample:
        # Evenly spaced, deterministic subset keeps large profiles fast to build.
        indices = sorted({round(i * (len(features) - 1) / (sample - 1)) for i in range(sample)})
    scores = [
        image_score(distances(features[i], bank[owners != i], device)[0]) for i in indices
    ]
    # Leave-one-out scores overstate normal scores (the scored image is missing from memory),
    # so a high quantile times a margin was too strict. Rule chosen on dev categories only.
    threshold = max(0.005, float(np.mean(scores) + 2 * np.std(scores)))
    return {
        "value": threshold,
        "method": "leave_one_reference_out_mean_plus_2sd",
        "status": "heuristic_not_probability",
        "reference_scores": scores,
        "scored_references": len(indices),
        "review_margin": 0.1,
    }


def decision(score: float, threshold: float, margin: float = 0.1) -> str:
    if score < threshold * (1 - margin):
        return "normal"
    if score > threshold * (1 + margin):
        return "anomaly"
    return "review"


def render_heatmap(image: Image.Image, scores: np.ndarray, grid: tuple[int, int], threshold: float):
    # Fixed profile-relative scale; do not min-max each image into a false hot spot.
    intensity = np.clip(scores.reshape(grid) / max(threshold * 2, 1e-6), 0, 1)
    mask = Image.fromarray((intensity * 255).astype(np.uint8)).resize(
        image.size, Image.Resampling.BILINEAR
    )
    strength = np.asarray(mask, dtype=np.float32) / 255
    heat = np.zeros((*strength.shape, 4), dtype=np.uint8)
    heat[..., 0] = 255
    heat[..., 1] = (200 * (1 - strength)).astype(np.uint8)
    heat[..., 3] = (strength * 190).astype(np.uint8)
    heatmap = Image.fromarray(heat)
    overlay = Image.alpha_composite(image.convert("RGBA"), heatmap).convert("RGB")
    return heatmap, overlay
