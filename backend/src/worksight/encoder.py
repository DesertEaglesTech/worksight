import math
import os
import platform

import numpy as np
import torch
import torch.nn.functional as F
import torchvision
from PIL import Image
from torchvision.models import ResNet18_Weights, resnet18


def select_device(requested: str, require_amd: bool = False) -> torch.device:
    if requested not in {"auto", "cpu", "cuda", "mps"}:
        raise ValueError("WORKSIGHT_DEVICE must be auto, cpu, cuda or mps")
    device = torch.device(
        "cuda"
        if requested == "auto" and torch.cuda.is_available()
        else "cpu"
        if requested == "auto"
        else requested
    )
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA/HIP GPU is not available to this PyTorch installation")
    if device.type == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("Apple MPS is not available")
    if require_amd and not (device.type == "cuda" and torch.version.hip):
        raise RuntimeError(
            "AMD required: install ROCm PyTorch on an accessible AMD GPU; CPU fallback is disabled"
        )
    return device


def cpu_budget() -> int:
    """CPUs this process may really use; containers often see the host's cores but get a quota."""
    count = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else os.cpu_count()
    try:
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()
        if quota != "max":
            count = min(count, max(1, math.ceil(int(quota) / int(period))))
    except (OSError, ValueError):
        pass
    return max(1, count or 1)


class VisualEncoder:
    """Frozen ImageNet encoder. Full image resized, never center-cropped."""

    def __init__(
        self,
        device: str = "auto",
        require_amd: bool = False,
        image_size: int = 384,
        threads: int | None = None,
    ):
        self.device = select_device(device, require_amd)
        if self.device.type == "cpu":
            # Oversubscribing a CPU quota makes every inference much slower.
            torch.set_num_threads(threads or cpu_budget())
        self.image_size = image_size
        self.signature = f"resnet18-imagenet1k-v1-layer2-layer3-l2-resize{image_size}-v1"
        # A download failure is an error, never a switch to random weights.
        self.model = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1).eval().to(self.device)
        self.model.requires_grad_(False)

    def synchronize(self):
        if self.device.type == "cuda":
            torch.cuda.synchronize(self.device)
        elif self.device.type == "mps":
            torch.mps.synchronize()

    def info(self) -> dict:
        amd = bool(self.device.type == "cuda" and torch.version.hip)
        return {
            "device": str(self.device),
            "amd_gpu": amd,
            "device_name": torch.cuda.get_device_name(self.device)
            if self.device.type == "cuda"
            else platform.processor() or self.device.type,
            "torch_version": torch.__version__,
            "torchvision_version": torchvision.__version__,
            "hip_version": torch.version.hip,
            "cpu_threads": torch.get_num_threads(),
            "encoder": self.signature,
        }

    @torch.inference_mode()
    def extract(self, image: Image.Image) -> tuple[np.ndarray, tuple[int, int]]:
        image = image.convert("RGB").resize(
            (self.image_size, self.image_size), Image.Resampling.BILINEAR
        )
        x = (
            torch.from_numpy(np.asarray(image).copy())
            .permute(2, 0, 1)
            .float()
            .unsqueeze(0)
            .to(self.device)
            / 255
        )
        mean = torch.tensor([0.485, 0.456, 0.406], device=self.device).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225], device=self.device).view(1, 3, 1, 1)
        m = self.model
        x = m.maxpool(m.relu(m.bn1(m.conv1((x - mean) / std))))
        x = m.layer1(x)
        low = m.layer2(x)
        high = m.layer3(low)
        low = F.avg_pool2d(low, 3, stride=1, padding=1)
        high = F.avg_pool2d(high, 3, stride=1, padding=1)
        high = F.interpolate(high, size=low.shape[-2:], mode="bilinear", align_corners=False)
        features = torch.cat([low, high], dim=1)
        grid = tuple(features.shape[-2:])
        features = F.normalize(features.flatten(2).transpose(1, 2)[0], dim=1)
        return features.cpu().numpy(), grid
