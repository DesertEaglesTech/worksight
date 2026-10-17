import hmac
import re
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .config import Settings
from .service import Conflict, InspectionService


class FeedbackRequest(BaseModel):
    label: Literal["normal", "anomaly", "unsure"]
    note: str = Field(default="", max_length=2000)


class CandidateRequest(BaseModel):
    feedback_ids: list[str] = Field(min_length=1, max_length=50)


def create_app(settings: Settings | None = None, service: InspectionService | None = None):
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.service = service or InspectionService(config)
        yield
        app.state.service.close()

    app = FastAPI(
        title="Worksight API",
        version="0.1.0",
        lifespan=lifespan,
        description="Reference-based inspection. Scores are not calibrated defect probabilities.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )

    def get_service():
        return app.state.service

    def authorize(authorization: str | None = Header(default=None)):
        if config.api_key and not hmac.compare_digest(
            authorization or "", f"Bearer {config.api_key}"
        ):
            raise HTTPException(401, "Invalid or missing API key")

    @app.exception_handler(KeyError)
    async def not_found(_request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc.args[0])})

    @app.exception_handler(Conflict)
    async def conflict(_request, exc):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ValueError)
    async def invalid(_request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    async def upload(file: UploadFile, svc):
        try:
            content = await file.read(config.max_upload_bytes + 1)
            return svc.save_upload(content)
        finally:
            await file.close()

    dependencies = [Depends(authorize)]

    @app.get("/health")
    def health(svc=Depends(get_service)):
        return svc.health()

    @app.post("/api/v1/runtime/warmup", status_code=202, dependencies=dependencies)
    def warmup(svc=Depends(get_service)):
        return svc.submit("warmup", lambda: svc.encoder.info())

    @app.get("/api/v1/profiles", dependencies=dependencies)
    def profiles(svc=Depends(get_service)):
        return {"items": svc.store.all("profile")}

    @app.post("/api/v1/profiles", status_code=202, dependencies=dependencies)
    async def create_profile(
        name: str = Form(..., min_length=1, max_length=120),
        images: list[UploadFile] = File(...),
        svc=Depends(get_service),
    ):
        if not 3 <= len(images) <= config.max_reference_images:
            raise HTTPException(422, f"Provide 3–{config.max_reference_images} reference images")
        saved = [await upload(im, svc) for im in images]
        return svc.create_profile(name, saved)

    @app.get("/api/v1/profiles/{profile_id}", dependencies=dependencies)
    def profile(profile_id: str, svc=Depends(get_service)):
        return svc.store.get("profile", profile_id)

    @app.get("/api/v1/profiles/{profile_id}/versions", dependencies=dependencies)
    def versions(profile_id: str, svc=Depends(get_service)):
        svc.store.get("profile", profile_id)
        return {"items": [v for v in svc.store.all("version") if v["profile_id"] == profile_id]}

    @app.post(
        "/api/v1/profiles/{profile_id}/inspections", status_code=202, dependencies=dependencies
    )
    async def inspect(profile_id: str, image: UploadFile = File(...), svc=Depends(get_service)):
        svc.store.get("profile", profile_id)
        return svc.inspect(profile_id, await upload(image, svc))

    @app.get("/api/v1/profiles/{profile_id}/inspections", dependencies=dependencies)
    def inspections(profile_id: str, svc=Depends(get_service)):
        svc.store.get("profile", profile_id)
        return {"items": [i for i in svc.store.all("inspection") if i["profile_id"] == profile_id]}

    @app.get("/api/v1/inspections/{inspection_id}", dependencies=dependencies)
    def inspection(inspection_id: str, svc=Depends(get_service)):
        return svc.store.get("inspection", inspection_id)

    @app.post("/api/v1/inspections/{inspection_id}/feedback", dependencies=dependencies)
    def feedback(inspection_id: str, body: FeedbackRequest, svc=Depends(get_service)):
        return svc.feedback(inspection_id, body.label, body.note)

    @app.get("/api/v1/profiles/{profile_id}/feedback", dependencies=dependencies)
    def feedback_list(profile_id: str, svc=Depends(get_service)):
        svc.store.get("profile", profile_id)
        return {"items": [f for f in svc.store.all("feedback") if f["profile_id"] == profile_id]}

    @app.post("/api/v1/profiles/{profile_id}/validation", dependencies=dependencies)
    async def validation(
        profile_id: str,
        normal: list[UploadFile] = File(...),
        anomaly: list[UploadFile] = File(...),
        svc=Depends(get_service),
    ):
        svc.store.get("profile", profile_id)
        if (
            min(len(normal), len(anomaly)) < config.min_validation_per_class
            or len(normal) + len(anomaly) > 100
        ):
            raise HTTPException(
                422,
                f"Provide at least {config.min_validation_per_class} images per class, at most 100 total",
            )
        return svc.set_validation(
            profile_id,
            [await upload(im, svc) for im in normal],
            [await upload(im, svc) for im in anomaly],
        )

    @app.post(
        "/api/v1/profiles/{profile_id}/candidates", status_code=202, dependencies=dependencies
    )
    def candidate(profile_id: str, body: CandidateRequest, svc=Depends(get_service)):
        return svc.create_candidate(profile_id, body.feedback_ids)

    @app.post(
        "/api/v1/profiles/{profile_id}/versions/{version_id}/evaluate",
        status_code=202,
        dependencies=dependencies,
    )
    def evaluate(profile_id: str, version_id: str, svc=Depends(get_service)):
        return svc.evaluate_candidate(profile_id, version_id)

    @app.post(
        "/api/v1/profiles/{profile_id}/versions/{version_id}/activate", dependencies=dependencies
    )
    def activate(profile_id: str, version_id: str, svc=Depends(get_service)):
        return svc.activate(profile_id, version_id)

    @app.get("/api/v1/evaluations/{evaluation_id}", dependencies=dependencies)
    def evaluation(evaluation_id: str, svc=Depends(get_service)):
        return svc.store.get("evaluation", evaluation_id)

    @app.get("/api/v1/jobs/{job_id}", dependencies=dependencies)
    def job(job_id: str, svc=Depends(get_service)):
        return svc.store.get("job", job_id)

    @app.get("/api/v1/assets/{filename}", dependencies=dependencies)
    def asset(filename: str, svc=Depends(get_service)):
        if not re.fullmatch(r"(?:[0-9a-f]{32}|[0-9a-f]{64})\.png", filename):
            raise HTTPException(404, "Asset not found")
        path = svc.store.assets / filename
        if not path.is_file():
            raise HTTPException(404, "Asset not found")
        return FileResponse(
            path, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"}
        )

    return app


app = create_app()
