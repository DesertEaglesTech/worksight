import base64
import hashlib
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from time import perf_counter

import numpy as np

from . import documents as docs
from .config import Settings
from .detector import (
    decision,
    distances,
    estimate_threshold,
    image_score,
    make_bank,
    render_heatmap,
)
from .encoder import VisualEncoder, cpu_budget
from .evaluation import metrics, promotion_gate
from .report import ReportError, TokenFactoryClient, build_messages, generate
from .store import Store, new_id, now

log = logging.getLogger(__name__)


def utc_iso(value):
    """Parse an ISO time with timezone (Z or offset) into the stored UTC format."""
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Times must be ISO 8601 with timezone") from exc
    if parsed.tzinfo is None:
        raise ValueError("Times must include a timezone")
    return parsed.astimezone(UTC).isoformat()


class Conflict(ValueError):
    pass


class Unavailable(RuntimeError):
    pass


class RateLimited(RuntimeError):
    pass


class InspectionService:
    """Single-process prototype with one GPU queue; persistent records and immutable versions."""

    def __init__(self, settings: Settings, encoder_factory=None, report_client=None):
        self.settings = settings
        self.store = Store(settings.data_dir)
        self.encoder_factory = encoder_factory or (
            lambda: VisualEncoder(
                settings.device, settings.require_amd, settings.image_size, settings.torch_threads
            )
        )
        self._encoder = None
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="worksight-gpu")
        # Reports wait on a remote model; keep them off the GPU queue.
        self.report_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="worksight-report")
        self.report_client = report_client or (
            TokenFactoryClient(
                settings.report_base_url, settings.report_api_key, settings.report_timeout_s
            )
            if settings.report_api_key
            else None
        )
        # In-process tasks cannot survive a restart. Do not leave stale running states.
        for job in self.store.all("job"):
            if job["status"] in {"queued", "running"}:
                job.update(
                    status="failed",
                    error="Server restarted; resubmit the operation",
                    finished_at=now(),
                )
                self.store.put("job", job)
                if job.get("resource_kind") in {"profile", "inspection", "report"}:
                    resource = self.store.get(job["resource_kind"], job["resource_id"])
                    resource["status"] = "failed"
                    self.store.put(job["resource_kind"], resource)

    @property
    def encoder(self):
        if self._encoder is None:
            self._encoder = self.encoder_factory()
        return self._encoder

    def close(self):
        self.executor.shutdown(wait=True)
        self.report_executor.shutdown(wait=True)

    def health(self):
        return {
            "status": "ok",
            "model_loaded": self._encoder is not None,
            "require_amd": self.settings.require_amd,
            "runtime": self._encoder.info() if self._encoder is not None else None,
            "queue": "single_process",
            "cpu_budget": cpu_budget(),
            "report": {
                "enabled": self.report_client is not None,
                "provider": "AMD Token Factory",
                "models": list(self.settings.report_models),
            },
            "version": "0.1.0",
        }

    def submit(
        self, operation: str, action, resource_kind=None, resource_id=None, executor=None, job_id=None
    ):
        job = {
            "id": job_id or new_id(),
            "operation": operation,
            "status": "queued",
            "created_at": now(),
            "resource_kind": resource_kind,
            "resource_id": resource_id,
            "result": None,
            "error": None,
        }
        self.store.put("job", job)

        def run():
            job.update(status="running", started_at=now())
            self.store.put("job", job)
            try:
                job["result"] = action()
                job["status"] = "succeeded"
            except Exception as exc:
                log.exception("Operation %s failed (%s)", operation, job["id"])
                job.update(
                    status="failed",
                    error=str(exc)
                    if isinstance(exc, ReportError)
                    else f"{type(exc).__name__}: processing failed; see server logs",
                )
                if resource_kind in {"profile", "inspection", "report"}:
                    resource = self.store.get(resource_kind, resource_id)
                    resource.update(status="failed", error=job["error"])
                    self.store.put(resource_kind, resource)
            job["finished_at"] = now()
            self.store.put("job", job)

        (executor or self.executor).submit(run)
        return {
            "job_id": job["id"],
            "status": "queued",
            "resource_id": resource_id,
            "job_url": f"/api/v1/jobs/{job['id']}",
        }

    def save_upload(self, content):
        return self.store.save_image(
            content, self.settings.max_upload_bytes, self.settings.max_image_pixels
        )

    def _features(self, images):
        return [self.encoder.extract(self.store.image(item["asset"]))[0] for item in images]

    def _version(self, profile_id, version_id=None):
        profile = self.store.get("profile", profile_id)
        identifier = version_id or profile["active_version_id"]
        if identifier is None:
            raise Conflict("Profile is not ready")
        version = self.store.get("version", identifier)
        if version["profile_id"] != profile_id:
            raise ValueError("Version belongs to a different profile")
        return version

    def _load_bank(self, version):
        if version["encoder"] != self.encoder.signature:
            raise Conflict(
                "Profile encoder differs from this server; use the original encoder configuration"
            )
        with np.load(self.store.banks / f"{version['id']}.npz", allow_pickle=False) as archive:
            return archive["bank"], archive["owners"]

    def _save_version(self, profile_id, images, parent=None, feedback_ids=None):
        start = perf_counter()
        features = self._features(images)
        bank, owners = make_bank(features, self.settings.memory_per_image)
        # Keep the baseline threshold for feedback candidates: improvement cannot come from moving it.
        threshold = (
            parent["threshold"]
            if parent
            else estimate_threshold(features, bank, owners, self.encoder.device)
        )
        version = {
            "id": new_id(),
            "profile_id": profile_id,
            "created_at": now(),
            "parent_version_id": parent["id"] if parent else None,
            "state": "candidate" if parent else "approved",
            "encoder": self.encoder.signature,
            "references": images,
            "reference_count": len(images),
            "memory_patches": len(bank),
            "threshold": threshold,
            "feedback_ids": feedback_ids or [],
            "evaluation_id": None,
            "runtime": self.encoder.info(),
            "build_ms": round((perf_counter() - start) * 1000, 3),
        }
        path = self.store.banks / f"{version['id']}.npz"
        temp = path.with_suffix(".tmp.npz")
        np.savez_compressed(temp, bank=bank, owners=owners)
        temp.replace(path)
        self.store.put("version", version)
        return version

    def create_profile(self, name, images):
        if not name.strip() or len(name.strip()) > 120:
            raise ValueError("Profile name must contain 1–120 characters")
        if not 3 <= len(images) <= self.settings.max_reference_images:
            raise ValueError(
                f"Provide 3–{self.settings.max_reference_images} reference images; 10–20 recommended"
            )
        if len({im["sha256"] for im in images}) != len(images):
            raise ValueError("Reference images must be distinct; duplicates do not add coverage")
        profile = {
            "id": new_id(),
            "name": name.strip(),
            "status": "queued",
            "created_at": now(),
            "active_version_id": None,
            "validation_id": None,
            "error": None,
        }
        self.store.put("profile", profile)

        def build():
            profile["status"] = "running"
            self.store.put("profile", profile)
            version = self._save_version(profile["id"], images)
            profile.update(status="ready", active_version_id=version["id"])
            self.store.put("profile", profile)
            return {"profile_id": profile["id"], "version_id": version["id"]}

        return self.submit("create_profile", build, "profile", profile["id"])

    def inspect(self, profile_id, image):
        version = self._version(profile_id)
        inspection = {
            "id": new_id(),
            "profile_id": profile_id,
            "version_id": version["id"],
            "image": image,
            "status": "queued",
            "created_at": now(),
        }
        self.store.put("inspection", inspection)

        def run():
            inspection["status"] = "running"
            self.store.put("inspection", inspection)
            bank, owners = self._load_bank(version)
            original = self.store.image(image["asset"])
            self.encoder.synchronize()
            start = perf_counter()
            features, grid = self.encoder.extract(original)
            patch_scores, matches = distances(features, bank, self.encoder.device)
            self.encoder.synchronize()
            latency = (perf_counter() - start) * 1000
            score = image_score(patch_scores)
            threshold = version["threshold"]["value"]
            heatmap, overlay = render_heatmap(original, patch_scores, grid, threshold)
            heat_name, overlay_name = f"{new_id()}.png", f"{new_id()}.png"
            heatmap.save(self.store.assets / heat_name)
            overlay.save(self.store.assets / overlay_name)
            best_owner = int(np.bincount(owners[matches]).argmax())
            reference = version["references"][best_owner]
            inspection.update(
                status="ready",
                anomaly_score=score,
                threshold=threshold,
                decision=decision(score, threshold),
                threshold_status=version["threshold"]["status"],
                image_url=f"/api/v1/assets/{image['asset']}",
                heatmap_url=f"/api/v1/assets/{heat_name}",
                overlay_url=f"/api/v1/assets/{overlay_name}",
                reference_url=f"/api/v1/assets/{reference['asset']}",
                reference_match_method="most_nearest_patch_votes",
                inference_ms=round(latency, 3),
                runtime=self.encoder.info(),
                matches_reference_image=image["sha256"]
                in {r["sha256"] for r in version["references"]},
                finished_at=now(),
            )
            self.store.put("inspection", inspection)
            return {"inspection_id": inspection["id"]}

        return self.submit("inspect", run, "inspection", inspection["id"])

    def feedback(self, inspection_id, label, note=""):
        with self.lock:
            inspection = self.store.get("inspection", inspection_id)
            if inspection["status"] != "ready":
                raise Conflict("Inspection has not completed")
            if label not in {"normal", "anomaly", "unsure"}:
                raise ValueError("Unsupported feedback label")
            # One authoritative human label per inspection, deliberately immutable in this MVP.
            existing = [
                f for f in self.store.all("feedback") if f["inspection_id"] == inspection_id
            ]
            if existing:
                if existing[0]["label"] == label:
                    return existing[0]
                raise Conflict(
                    "This inspection already has feedback; conflicting labels need manual resolution"
                )
            record = {
                "id": new_id(),
                "inspection_id": inspection_id,
                "profile_id": inspection["profile_id"],
                "version_id": inspection["version_id"],
                "image": inspection["image"],
                "label": label,
                "note": note,
                "created_at": now(),
            }
            return self.store.put("feedback", record)

    def set_validation(self, profile_id, normal, anomaly):
        with self.lock:
            profile = self.store.get("profile", profile_id)
            version = self._version(profile_id)
            if profile["validation_id"]:
                raise Conflict(
                    "Validation set is frozen for this profile; create another profile for a different experiment"
                )
            if min(len(normal), len(anomaly)) < self.settings.min_validation_per_class:
                raise ValueError(
                    f"Provide at least {self.settings.min_validation_per_class} images per class"
                )
            if len(normal) + len(anomaly) > 100:
                raise ValueError("Validation is limited to 100 images")
            images = normal + anomaly
            hashes = {r["sha256"] for r in images}
            forbidden = {
                r["sha256"]
                for v in self.store.all("version")
                if v["profile_id"] == profile_id
                for r in v["references"]
            }
            forbidden |= {
                f["image"]["sha256"]
                for f in self.store.all("feedback")
                if f["profile_id"] == profile_id
            }
            if len(hashes) != len(images) or hashes & forbidden:
                raise ValueError(
                    "Validation images must be distinct and separate from references and feedback"
                )
            record = {
                "id": new_id(),
                "profile_id": profile_id,
                "created_at": now(),
                "baseline_version_id": version["id"],
                "samples": [{"image": im, "label": 0} for im in normal]
                + [{"image": im, "label": 1} for im in anomaly],
            }
            self.store.put("validation", record)
            profile["validation_id"] = record["id"]
            self.store.put("profile", profile)
            return record

    def create_candidate(self, profile_id, feedback_ids):
        parent = self._version(profile_id)
        profile = self.store.get("profile", profile_id)
        validation_hashes = set()
        if profile["validation_id"]:
            validation_hashes = {
                s["image"]["sha256"]
                for s in self.store.get("validation", profile["validation_id"])["samples"]
            }
        if not feedback_ids or len(set(feedback_ids)) != len(feedback_ids):
            raise ValueError("Provide distinct feedback IDs")
        images = list(parent["references"])
        hashes = {im["sha256"] for im in images}
        for identifier in feedback_ids:
            feedback = self.store.get("feedback", identifier)
            if feedback["profile_id"] != profile_id or feedback["label"] != "normal":
                raise ValueError(
                    "Only confirmed-normal feedback from this profile can enter normal memory"
                )
            image = feedback["image"]
            if image["sha256"] in validation_hashes:
                raise ValueError("Validation images cannot enter reference memory")
            conflicts = [
                f
                for f in self.store.all("feedback")
                if f["profile_id"] == profile_id
                and f["image"]["sha256"] == image["sha256"]
                and f["label"] != "normal"
            ]
            if conflicts:
                raise Conflict("Conflicting human labels exist for this image")
            if image["sha256"] not in hashes:
                images.append(image)
                hashes.add(image["sha256"])
        if len(images) == len(parent["references"]):
            raise ValueError("Selected feedback adds no new reference images")
        if len(images) > self.settings.max_reference_images:
            raise ValueError("Reference limit reached")

        def build():
            self._load_bank(parent)  # Refuse reusing a threshold with a different encoder.
            version = self._save_version(profile_id, images, parent, feedback_ids)
            return {"profile_id": profile_id, "version_id": version["id"], "state": "candidate"}

        return self.submit("create_candidate", build)

    def evaluate_candidate(self, profile_id, version_id):
        candidate = self._version(profile_id, version_id)
        parent = self._version(profile_id)
        profile = self.store.get("profile", profile_id)
        if candidate["state"] != "candidate" or candidate["parent_version_id"] != parent["id"]:
            raise Conflict("Candidate must be based on the current active version")
        if not profile["validation_id"]:
            raise Conflict("Upload a separate labelled validation set before evaluating")
        validation = self.store.get("validation", profile["validation_id"])

        def evaluate():
            parent_bank, _ = self._load_bank(parent)
            candidate_bank, _ = self._load_bank(candidate)
            labels, before, after = [], [], []
            for sample in validation["samples"]:
                features, _ = self.encoder.extract(self.store.image(sample["image"]["asset"]))
                labels.append(sample["label"])
                before.append(image_score(distances(features, parent_bank, self.encoder.device)[0]))
                after.append(
                    image_score(distances(features, candidate_bank, self.encoder.device)[0])
                )
            baseline_metrics = metrics(labels, before, parent["threshold"]["value"])
            candidate_metrics = metrics(labels, after, candidate["threshold"]["value"])
            report = {
                "id": new_id(),
                "profile_id": profile_id,
                "version_id": version_id,
                "baseline_version_id": parent["id"],
                "validation_id": validation["id"],
                "created_at": now(),
                "baseline": baseline_metrics,
                "candidate": candidate_metrics,
                "gate": promotion_gate(baseline_metrics, candidate_metrics),
                "runtime": self.encoder.info(),
                "purpose": "validation_for_version_selection_not_final_test",
                "samples": [
                    {
                        "sha256": s["image"]["sha256"],
                        "label": y,
                        "baseline_score": b,
                        "candidate_score": a,
                    }
                    for s, y, b, a in zip(validation["samples"], labels, before, after, strict=True)
                ],
            }
            self.store.put("evaluation", report)
            with self.lock:
                current = self.store.get("version", version_id)
                current["evaluation_id"] = report["id"]
                self.store.put("version", current)
            return {"evaluation_id": report["id"], "gate": report["gate"]}

        return self.submit("evaluate_candidate", evaluate)

    def activate(self, profile_id, version_id):
        with self.lock:
            profile = self.store.get("profile", profile_id)
            version = self._version(profile_id, version_id)
            reference_hashes = {r["sha256"] for r in version["references"]}
            if any(
                f["profile_id"] == profile_id
                and f["image"]["sha256"] in reference_hashes
                and f["label"] == "anomaly"
                for f in self.store.all("feedback")
            ):
                raise Conflict(
                    "A reference has since been labelled anomalous; resolve labels before activation"
                )
            if version["state"] == "candidate":
                if version["parent_version_id"] != profile["active_version_id"]:
                    raise Conflict(
                        "Active version changed; rebuild the candidate from the current version"
                    )
                if not version["evaluation_id"]:
                    raise Conflict("Candidate has not been evaluated")
                report = self.store.get("evaluation", version["evaluation_id"])
                if (
                    report["validation_id"] != profile["validation_id"]
                    or not report["gate"]["passed"]
                ):
                    raise Conflict("Candidate failed validation")
                version["state"] = "approved"
                self.store.put("version", version)
            previous = profile["active_version_id"]
            profile["active_version_id"] = version_id
            self.store.put("profile", profile)
            self.store.put(
                "activation",
                {
                    "id": new_id(),
                    "profile_id": profile_id,
                    "from_version_id": previous,
                    "to_version_id": version_id,
                    "created_at": now(),
                },
            )
            return profile

    def _accepted(self, job_id, resource_id, reused):
        job = self.store.get("job", job_id)
        return {
            "job_id": job_id,
            "status": job["status"],
            "resource_id": resource_id,
            "job_url": f"/api/v1/jobs/{job_id}",
            "reused": reused,
        }

    def request_report(self, inspection_id, idempotency_key=None, refresh=False):
        if self.report_client is None:
            raise Unavailable("Inspection reports are not configured on this server")
        with self.lock:
            inspection = self.store.get("inspection", inspection_id)
            if inspection["status"] != "ready":
                raise Conflict("Inspection has not completed")
            key_id = None
            if idempotency_key:
                if not 1 <= len(idempotency_key) <= 200:
                    raise ValueError("Idempotency-Key must contain 1–200 characters")
                key_id = hashlib.sha256(f"report:{idempotency_key}".encode()).hexdigest()
                try:
                    known = self.store.get("idempotency", key_id)
                except KeyError:
                    known = None
                if known:
                    if known["inspection_id"] != inspection_id:
                        raise Conflict("Idempotency-Key was already used for another request")
                    report = self.store.get("report", known["report_id"])
                    return self._accepted(report["job_id"], report["id"], True)
            existing = [
                r
                for r in self.store.all("report")
                if r["inspection_id"] == inspection_id
                and r["status"] != "failed"
                and r.get("job_id")  # records from before job_id was stored are not reused
            ]
            if existing and not refresh:
                return self._accepted(existing[0]["job_id"], existing[0]["id"], True)
            now_dt = datetime.now(UTC)
            recent = [
                datetime.fromisoformat(r["created_at"]) for r in self.store.all("report")
            ]
            if sum(t > now_dt - timedelta(hours=1) for t in recent) >= (
                self.settings.report_hourly_limit
            ) or sum(t > now_dt - timedelta(days=1) for t in recent) >= (
                self.settings.report_daily_limit
            ):
                raise RateLimited(
                    "AI description limit reached for this demo; try again later"
                )
            report = {
                "id": new_id(),
                "inspection_id": inspection_id,
                "profile_id": inspection["profile_id"],
                "status": "queued",
                "created_at": now(),
                "assistive_only": True,
                "model_decision": inspection["decision"],
                "inputs": ["original", "heatmap_overlay", "reference"],
                "documents_used": [],
                "error": None,
                # Known before the job starts, so no later write races the worker.
                "job_id": new_id(),
            }
            self.store.put("report", report)

            def run():
                report["status"] = "running"
                self.store.put("report", report)
                asset = lambda url: self.store.image(url.rsplit("/", 1)[-1])  # noqa: E731
                documents = self._document_context(inspection["profile_id"])
                messages = build_messages(
                    inspection,
                    self.store.image(inspection["image"]["asset"]),
                    asset(inspection["overlay_url"]),
                    asset(inspection["reference_url"]),
                    self.settings.report_image_side,
                    documents["text"],
                )
                result = generate(
                    self.report_client,
                    self.settings.report_models,
                    messages,
                    self.settings.report_max_tokens,
                )
                report.update(
                    status="ready", finished_at=now(), documents_used=documents["ids"], **result
                )
                self.store.put("report", report)
                return {"report_id": report["id"], "inspection_id": inspection_id}

            accepted = self.submit(
                "report", run, "report", report["id"], self.report_executor, report["job_id"]
            )
            if key_id:
                self.store.put(
                    "idempotency",
                    {
                        "id": key_id,
                        "operation": "report",
                        "inspection_id": inspection_id,
                        "report_id": report["id"],
                        "created_at": now(),
                    },
                )
            return {**accepted, "reused": False}

    def latest_report(self, inspection_id):
        self.store.get("inspection", inspection_id)
        reports = [r for r in self.store.all("report") if r["inspection_id"] == inspection_id]
        if not reports:
            raise KeyError("report not found")
        return reports[0]

    def list_inspections(
        self,
        profile_id,
        limit=None,
        cursor=None,
        since=None,
        until=None,
        decision=None,
        human=None,
    ):
        """Newest first by (created_at, id). Without `limit` the old unpaginated shape is kept."""
        self.store.get("profile", profile_id)
        since, until = utc_iso(since), utc_iso(until)
        labels = {
            f["inspection_id"]: f["label"]
            for f in self.store.all("feedback")
            if f["profile_id"] == profile_id
        }
        items = []
        for inspection in self.store.all("inspection"):
            if inspection["profile_id"] != profile_id:
                continue
            created = inspection["created_at"]
            label = labels.get(inspection["id"])
            if since and created < since or until and created >= until:
                continue
            if decision and inspection.get("decision") != decision:
                continue
            if human == "none" and label is not None or human == "any" and label is None:
                continue
            if human in {"normal", "anomaly", "unsure"} and label != human:
                continue
            items.append({**inspection, "feedback_label": label})
        if limit is None:
            return {"items": items}
        if cursor:
            try:
                after = tuple(json.loads(base64.urlsafe_b64decode(cursor.encode())))
            except (ValueError, TypeError) as exc:
                raise ValueError("Invalid cursor") from exc
            items = [i for i in items if (i["created_at"], i["id"]) < after]
        page = items[:limit]
        next_cursor = None
        if len(items) > limit:
            last = page[-1]
            next_cursor = base64.urlsafe_b64encode(
                json.dumps([last["created_at"], last["id"]]).encode()
            ).decode()
        return {"items": page, "next_cursor": next_cursor}

    def add_document(self, profile_id, filename, content):
        self.store.get("profile", profile_id)
        extracted = docs.extract(filename, content)
        with self.lock:
            if any(
                d["profile_id"] == profile_id and d["sha256"] == extracted["sha256"]
                for d in self.store.all("document")
            ):
                raise Conflict("This document is already attached to the profile")
            record = {"id": new_id(), "profile_id": profile_id, "created_at": now(), **extracted}
            self.store.put("document", record)
        return self._document_summary(record)

    @staticmethod
    def _document_summary(record):
        summary = {k: v for k, v in record.items() if k != "text"}
        summary["excerpt"] = record["text"][:300]
        return summary

    def list_documents(self, profile_id):
        self.store.get("profile", profile_id)
        return {
            "items": [
                self._document_summary(d)
                for d in self.store.all("document")
                if d["profile_id"] == profile_id
            ]
        }

    def _document_context(self, profile_id):
        attached = [d for d in self.store.all("document") if d["profile_id"] == profile_id]
        return {
            "text": docs.context(attached, self.settings.report_document_chars),
            "ids": [d["id"] for d in attached],
        }
