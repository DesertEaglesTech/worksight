import { afterEach, expect, it, vi } from "vitest";
import { backendProfileSchema, backendVersionSchema, backendInspectionSchema, backendFeedbackSchema, backendJobSchema } from "../src/lib/backend-contract";
import { backendRequest, backendErrorMessage, createBackendApi, mapProfile, mapVersions, mapInspection, mapJob, feedbackLabel, backendLimits } from "../src/lib/backend-api";
import { allowedRoute, upstreamError } from "../src/lib/proxy";
import { assetUrl } from "../src/lib/api";
const date = "2026-10-18T01:00:00.123456+00:00";
const asset = `${"a".repeat(64)}.png`;
const image = { asset, sha256: "a".repeat(64), width: 640, height: 480 };
const runtime = { device: "cpu", device_name: "arm", amd_gpu: false, torch_version: "2.14.1", torchvision_version: "0.29.1", hip_version: null, encoder: "resnet18" };
const profile = backendProfileSchema.parse({ id: "p1", name: "PCB", created_at: date, status: "ready", active_version_id: "v1", validation_id: null, error: null });
const version = backendVersionSchema.parse({ id: "v1", profile_id: "p1", created_at: date, parent_version_id: null, state: "approved", reference_count: 10, references: [image], threshold: { value: 0.2, status: "heuristic_not_probability" }, feedback_ids: [], evaluation_id: null });
const rawInspection = { id: "i1", profile_id: "p1", version_id: "v1", status: "ready", created_at: date, finished_at: date, image_url: `/api/v1/assets/${asset}`, heatmap_url: `/api/v1/assets/${"b".repeat(32)}.png`, overlay_url: `/api/v1/assets/${"c".repeat(32)}.png`, reference_url: `/api/v1/assets/${asset}`, anomaly_score: 0.31, threshold: 0.2, threshold_status: "heuristic_not_probability", decision: "anomaly", inference_ms: 12.3, runtime, matches_reference_image: false };
const feedback = backendFeedbackSchema.parse({ id: "f1", inspection_id: "i1", profile_id: "p1", version_id: "v1", image, label: "normal", note: "Confirmed", created_at: date });
afterEach(() => vi.unstubAllGlobals());
it("maps offset timestamps, active opaque versions and actual profile references", () => {
  const second = { ...version, id: "v2", created_at: "2026-10-18T02:00:00+00:00", parent_version_id: "v1", reference_count: 11 };
  expect(mapVersions(profile, [second, version]).map(v => [v.id, v.version, v.active])).toEqual([["v1", 1, true], ["v2", 2, false]]);
  expect(mapProfile(profile, [version, second])).toMatchObject({ id: "p1", version: 1, sample_count: 10, description: "", thumbnail_url: `/api/v1/assets/${asset}` });
  expect(mapProfile({ ...profile, active_version_id: null, status: "running" }, [])).toMatchObject({ status: "building", version: 0, sample_count: 0 });
  expect(mapProfile({ ...profile, status: "failed" }, [version]).status).toBe("failed");
  expect(() => mapProfile(profile, [])).toThrow("missing");
});
it("maps real inference fields, every decision, and separately loaded immutable feedback", () => {
  for (const [decision, mapped] of [["normal", "pass"], ["anomaly", "fail"], ["review", "review"]]) {
    const result = mapInspection(backendInspectionSchema.parse({ ...rawInspection, decision }), mapVersions(profile, [version]), [feedback]);
    expect(result).toMatchObject({ model_decision: mapped, processing_ms: 12.3, profile_version: 1, anomaly_score: 0.31, threshold: 0.2, runtime: { device: "cpu", amd_gpu: false }, feedback: { human_decision: "pass", comment: "Confirmed" } });
  }
  expect(feedbackLabel).toEqual({ pass: "normal", fail: "anomaly", review: "unsure" });
  expect(() => mapInspection(backendInspectionSchema.parse(rawInspection), [], [])).toThrow("version is missing");
});
it("maps backend jobs without fictional progress, and preserves version/evaluation IDs", () => {
  const job = backendJobSchema.parse({ id: "j", operation: "create_candidate", status: "succeeded", result: { profile_id: "p1", version_id: "v2", state: "candidate" }, error: null, created_at: date });
  expect(mapJob(job)).toMatchObject({ stage: "create_candidate", progress: null, result: { version_id: "v2" }, error: null });
  expect(mapJob({ ...job, status: "failed", result: null, error: "Encoder failed" }).error).toEqual({ code: "processing_failed", message: "Encoder failed" });
});
it("handles FastAPI detail strings, arrays, service outages and invalid responses", async () => {
  expect(backendErrorMessage(422, { detail: [{ msg: "Field required" }] })).toBe("Field required");
  expect(backendErrorMessage(409, { detail: "Frozen" })).toBe("Frozen");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(backendRequest("/profiles", backendProfileSchema)).rejects.toMatchObject({ code: "service_unavailable" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ surprise: true })));
  await expect(backendRequest("/profiles", backendProfileSchema)).rejects.toMatchObject({ code: "invalid_response" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "conflicting" }, { status: 409 })));
  await expect(createBackendApi().feedback("i1", "fail", "defect")).rejects.toMatchObject({ code: "feedback_conflict", status: 409, message: expect.stringContaining("different engineer decision") });
});
it("stages drafts only in memory and submits one multipart create operation", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ job_id: "j1", status: "queued", resource_id: "p1", job_url: "/api/v1/jobs/j1" }, { status: 202 }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("Image", class { naturalWidth = 100; naturalHeight = 100; onload?: () => void; set src(_value: string) { this.onload?.(); } });
  const api = createBackendApi(); const draft = await api.createProfile("PCB", "not persisted");
  expect(fetcher).not.toHaveBeenCalled(); expect(draft).toMatchObject({ description: "", local_draft: true });
  await expect(api.buildProfile(draft.id)).rejects.toThrow("at least 3");
  const files = [1, 2, 3].map(n => new File([String(n)], `${n}.png`, { type: "image/png" }));
  await api.uploadSamples(draft.id, files); expect(fetcher).not.toHaveBeenCalled();
  expect(await api.buildProfile(draft.id)).toBe("j1");
  expect(fetcher.mock.calls[0][0]).toBe("/api/backend/api/v1/profiles");
  const form = fetcher.mock.calls[0][1].body as FormData;
  expect(form.get("name")).toBe("PCB"); expect(form.getAll("images")).toHaveLength(3);
  expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  await expect(createBackendApi().uploadSamples(draft.id, files)).rejects.toThrow("new draft");
});
it("allows only real routes and strict authenticated PNG asset paths", () => {
  const routes = [ ["GET", "api/v1/profiles"], ["GET", "api/v1/profiles/p1"], ["GET", "api/v1/profiles/p1/feedback"], ["POST", "api/v1/profiles/p1/inspections"], ["POST", "api/v1/profiles/p1/validation"], ["POST", "api/v1/profiles/p1/candidates"], ["POST", "api/v1/profiles/p1/versions/v2/evaluate"], ["POST", "api/v1/profiles/p1/versions/v2/activate"], ["GET", "api/v1/evaluations/e1"] ];
  for (const [method, path] of routes) expect(allowedRoute(method, path.split("/"))).toBe(true);
  for (const path of ["v1/profiles", "api/v1/capabilities", "api/v1/profiles/p1/build", "api/v1/assets/a.png", `api/v1/assets/${"a".repeat(32)}.svg`, "api/v1/../health", "api/v1/profiles/a%2fb"]) expect(allowedRoute("GET", path.split("/"))).toBe(false);
  for (const size of [32, 64]) { const path = `/api/v1/assets/${"a".repeat(size)}.png`; expect(assetUrl(path)).toBe(`/api/backend${path}`); expect(allowedRoute("GET", path.slice(1).split("/"))).toBe(true); }
  expect(assetUrl("/api/v1/assets/a.png")).toBe(""); expect(assetUrl(`/api/v1/assets/${"A".repeat(32)}.png`)).toBe("");
  expect(backendLimits).toMatchObject({ max_file_bytes: 10485760, max_files: 50, max_image_pixels: 16000000 });
  expect(upstreamError(422, { detail: [{ msg: "Invalid image" }] })).toBe("Invalid image");
  expect(upstreamError(500, { detail: "secret stack trace" })).not.toContain("secret");
  expect(upstreamError(409, { detail: "key=secret" }, "secret")).not.toContain("secret");
});
