import hashlib
import io
import json
import sqlite3
import warnings
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError


def new_id() -> str:
    return uuid4().hex


def now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root: Path):
        self.root = root
        self.assets = root / "assets"
        self.banks = root / "banks"
        self.assets.mkdir(parents=True, exist_ok=True)
        self.banks.mkdir(exist_ok=True)
        self.database = root / "worksight.sqlite3"
        with self.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(kind, id))"
            )

    def connect(self):
        return sqlite3.connect(self.database, timeout=30)

    def put(self, kind: str, record: dict):
        with self.connect() as db:
            db.execute(
                # Upsert keeps the row (and rowid); INSERT OR REPLACE would re-insert updated
                # records and make them look newest.
                "INSERT INTO records VALUES (?, ?, ?) "
                "ON CONFLICT(kind, id) DO UPDATE SET payload = excluded.payload",
                (kind, record["id"], json.dumps(record, allow_nan=False)),
            )
        return record

    def get(self, kind: str, identifier: str) -> dict:
        with self.connect() as db:
            row = db.execute(
                "SELECT payload FROM records WHERE kind=? AND id=?", (kind, identifier)
            ).fetchone()
        if row is None:
            raise KeyError(f"{kind} not found")
        return json.loads(row[0])

    def all(self, kind: str) -> list[dict]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC", (kind,)
            ).fetchall()
        records = [json.loads(row[0]) for row in rows]
        # Newest first by creation time, then ID; never by storage order.
        records.sort(key=lambda r: (r.get("created_at", ""), r["id"]), reverse=True)
        return records

    def save_image(self, content: bytes, max_bytes: int, max_pixels: int) -> dict:
        if not content or len(content) > max_bytes:
            raise ValueError("Image is empty or exceeds the 10 MiB limit")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(content)) as source:
                    if source.format not in {"JPEG", "PNG", "WEBP"}:
                        raise ValueError("Only JPEG, PNG and WebP are supported")
                    if source.width * source.height > max_pixels:
                        raise ValueError("Image exceeds the pixel limit")
                    image = ImageOps.exif_transpose(source).convert("RGB")
                    image.load()
        except (
            UnidentifiedImageError,
            OSError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ) as exc:
            raise ValueError("Invalid or oversized image") from exc
        digest = hashlib.sha256(f"{image.size}".encode() + image.tobytes()).hexdigest()
        name = f"{digest}.png"
        path = self.assets / name
        if not path.exists():
            tmp = self.assets / f".{new_id()}.png"
            image.save(tmp)
            tmp.replace(path)
        return {"asset": name, "sha256": digest, "width": image.width, "height": image.height}

    def image(self, asset: str) -> Image.Image:
        with Image.open(self.assets / asset) as image:
            return image.convert("RGB")
