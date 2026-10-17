import numpy as np
import pytest
from PIL import Image
from worksight.detector import (
    decision,
    distances,
    estimate_threshold,
    image_score,
    make_bank,
    render_heatmap,
)
from worksight.encoder import select_device
from worksight.evaluation import metrics, promotion_gate


def test_nearest_reference_and_anomaly_score():
    bank = np.array([[1, 0], [0, 1]], dtype=np.float32)
    scores, indices = distances(np.array([[1, 0], [-1, 0]], dtype=np.float32), bank)
    assert scores.tolist() == [0, 1]
    assert indices.tolist() == [0, 1]
    assert image_score(scores) == 1


def test_threshold_excludes_scored_image():
    features = [np.array([[1, 0]], dtype=np.float32), np.array([[0, 1]], dtype=np.float32)]
    bank, owners = make_bank(features)
    calibration = estimate_threshold(features, bank, owners)
    assert calibration["reference_scores"] == [1.0, 1.0]
    # mean + 2 sd of identical leave-one-out scores
    assert calibration["value"] == pytest.approx(1.0)
    assert calibration["method"] == "leave_one_reference_out_mean_plus_2sd"


def test_memory_keeps_every_reference_patch_by_default():
    features = [np.eye(4, dtype=np.float32), np.eye(4, dtype=np.float32)[:3]]
    bank, owners = make_bank(features)
    assert len(bank) == 7
    assert owners.tolist() == [0, 0, 0, 0, 1, 1, 1]
    assert len(make_bank(features, per_image=2)[0]) == 4


def test_heatmap_does_not_turn_normal_image_red():
    image = Image.new("RGB", (40, 20), "white")
    heat, overlay = render_heatmap(image, np.zeros(4), (2, 2), 0.1)
    assert heat.size == image.size == overlay.size
    assert np.asarray(heat)[..., 3].max() == 0
    assert np.array_equal(np.asarray(image), np.asarray(overlay))


def test_review_band_and_regression_gate():
    assert decision(0.5, 1) == "normal"
    assert decision(1, 1) == "review"
    assert decision(1.5, 1) == "anomaly"
    baseline = metrics([0, 0, 1, 1], [0.1, 0.7, 0.8, 0.9], 0.5)
    worse = metrics([0, 0, 1, 1], [0.1, 0.2, 0.3, 0.9], 0.5)
    assert baseline["false_positive"] == 1
    assert not promotion_gate(baseline, worse)["passed"]
    assert metrics([0, 0], [0.1, 0.2], 0.5)["auroc"] is None


def test_amd_requirement_refuses_cpu():
    with pytest.raises(RuntimeError, match="AMD required"):
        select_device("cpu", require_amd=True)
