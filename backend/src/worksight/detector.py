"""PatchCore-inspired baseline; deterministic sampling, not the published coreset algorithm."""

import math

import numpy as np
import torch
from PIL import Image


def make_bank(features: list[np.ndarray], per_image: int = 128) -> tuple[np.ndarray, np.ndarray]:
    banks, owners = [], []
    for i, patches in enumerate(features):
        indices = np.random.default_rng(42 + i).choice(
            len(patches), min(per_image, len(patches)), replace=False
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


def estimate_threshold(
    features: list[np.ndarray], bank: np.ndarray, owners: np.ndarray, device="cpu"
) -> dict:
    # Exclude ALL patches of the scored reference, avoiding self-match leakage.
    scores = [
        image_score(distances(f, bank[owners != i], device)[0]) for i, f in enumerate(features)
    ]
    threshold = max(0.005, float(np.quantile(scores, 0.95)) * 1.2)
    return {
        "value": threshold,
        "method": "leave_one_reference_out_q95_x1.2",
        "status": "heuristic_not_probability",
        "reference_scores": scores,
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
