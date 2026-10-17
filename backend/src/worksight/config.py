import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("WORKSIGHT_DATA_DIR", "data")))
    device: str = field(default_factory=lambda: os.getenv("WORKSIGHT_DEVICE", "auto"))
    require_amd: bool = field(
        default_factory=lambda: os.getenv("WORKSIGHT_REQUIRE_AMD", "0") == "1"
    )
    api_key: str = field(default_factory=lambda: os.getenv("WORKSIGHT_API_KEY", ""))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            x.strip()
            for x in os.getenv(
                "WORKSIGHT_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if x.strip()
        )
    )
    # Optional assistive report via AMD Token Factory; disabled without a key.
    report_api_key: str = field(default_factory=lambda: os.getenv("RADEON_API_KEY", ""))
    report_base_url: str = field(
        default_factory=lambda: os.getenv(
            "WORKSIGHT_REPORT_BASE_URL", "https://developer.amd.com.cn/radeon/api/v1"
        )
    )
    report_models: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            x.strip()
            for x in os.getenv(
                "WORKSIGHT_REPORT_MODELS", "Gemma-4-31B-IT,DeepSeek-V4.1-Flash"
            ).split(",")
            if x.strip()
        )
    )
    report_timeout_s: float = 120.0
    # Protect the shared Token Factory quota on public demos; counts all report requests.
    report_hourly_limit: int = field(
        default_factory=lambda: int(os.getenv("WORKSIGHT_REPORT_HOURLY_LIMIT", "30"))
    )
    report_daily_limit: int = field(
        default_factory=lambda: int(os.getenv("WORKSIGHT_REPORT_DAILY_LIMIT", "200"))
    )
    report_image_side: int = 512
    report_max_tokens: int = 800
    report_document_chars: int = 4000
    # Chosen on non-PCB VisA dev categories; PCB stays a held-out test (docs/BENCHMARK.md).
    image_size: int = 384
    torch_threads: int | None = field(
        default_factory=lambda: int(os.getenv("WORKSIGHT_TORCH_THREADS", "0")) or None
    )
    max_reference_images: int = 200
    # Memory cap: above it, each reference keeps an equal share of its patches.
    max_memory_patches: int = field(
        default_factory=lambda: int(os.getenv("WORKSIGHT_MAX_MEMORY_PATCHES", "80000"))
    )
    threshold_sample: int = 30  # references scored leave-one-out for the threshold
    max_batch_images: int = 200
    max_upload_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 16_000_000
    memory_per_image: int | None = None  # None keeps every reference patch
    min_validation_per_class: int = 5
