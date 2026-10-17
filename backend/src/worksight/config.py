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
    image_size: int = 224
    max_reference_images: int = 50
    max_upload_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 16_000_000
    memory_per_image: int = 128
    min_validation_per_class: int = 5
