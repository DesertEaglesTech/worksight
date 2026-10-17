import { ApiError } from "./api";
import { defaultLimits } from "./files";
import type { Inspection, Job, Profile, WorksightApi } from "./contract";

/** Disposable UI fixtures only. No storage, no ML inference, no fallback from live. */
export function createDemoApi(): WorksightApi {
  const now = () => new Date().toISOString();
  const initial: Profile = { id: "demo-bearing", name: "Bearing housing", description: "Machined steel flange · top view", status: "ready", version: 1, sample_count: 1, thumbnail_url: "/demo/reference.png", updated_at: now() };
  const profiles = new Map<string, Profile>([[initial.id, initial]]);
  const inspections = new Map<string, Inspection>();
  const jobs = new Map<string, { start: number; finish: () => Job["result"]; result?: Job["result"] }>();
  const getProfile = (id: string) => { const p = profiles.get(id); if (!p) throw new ApiError("Profile not found.", 404); return p; };
  const getInspection = (id: string) => { const r = inspections.get(id); if (!r) throw new ApiError("Inspection not found.", 404); return r; };
  const addJob = (finish: () => Job["result"]) => { const id = crypto.randomUUID(); jobs.set(id, { start: Date.now(), finish }); return id; };
  const delay = () => new Promise<void>(resolve => setTimeout(resolve, 180));
  return {
    async capabilities() { return { api_version: "1", limits: defaultLimits, features: { feedback: true, profile_updates: true, version_history: false, version_comparison: false, rollback: false } }; },
    async profiles() { await delay(); return [...profiles.values()].map(p => ({ ...p })); },
    async createProfile(name, description) { await delay(); const p: Profile = { id: crypto.randomUUID(), name, description, status: "draft", version: 0, sample_count: 0, thumbnail_url: null, updated_at: now() }; profiles.set(p.id, p); return { ...p }; },
    async uploadSamples(id, files) { await delay(); const p = getProfile(id); p.sample_count += files.length; p.updated_at = now(); if (!p.thumbnail_url) p.thumbnail_url = "/demo/reference.png"; return { ...p }; },
    async buildProfile(id) { const p = getProfile(id); if (!p.sample_count) throw new ApiError("Upload known-good samples first.", 422); p.status = "building"; return addJob(() => { p.status = "ready"; p.version += 1; p.updated_at = now(); return { profile_id: id }; }); },
    async job(id, signal) { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); const j = jobs.get(id); if (!j) throw new ApiError("Job not found.", 404); const elapsed = Date.now() - j.start; if (elapsed > 2200 && !j.result) j.result = j.finish(); return { id, status: j.result ? "succeeded" : elapsed < 700 ? "queued" : "running", stage: j.result ? "Processing complete" : "Processing", progress: null, result: j.result ?? null, error: null }; },
    async inspect(profileId, _image) { const p = getProfile(profileId); if (p.status !== "ready") throw new ApiError("Build this profile before inspection.", 409); const version = p.version; return addJob(() => { const id = crypto.randomUUID(); inspections.set(id, { id, profile_id: profileId, profile_version: version, original_url: "/demo/defect.png", heatmap_url: "/demo/heatmap.svg", reference_url: "/demo/reference.png", model_decision: "review", processing_ms: null, created_at: now(), feedback: null }); return { inspection_id: id }; }); },
    async inspection(id) { return { ...getInspection(id) }; },
    async feedback(id, human_decision, comment) { await delay(); const r = getInspection(id); r.feedback = { id: crypto.randomUUID(), human_decision, comment, created_at: now() }; return { ...r }; },
    async versions() { throw new ApiError("Version history is planned. Connect a backend that supports it.", 501); },
    async compare() { throw new ApiError("Version comparison is planned.", 501); },
    async rollback() { throw new ApiError("Rollback is planned.", 501); },
  };
}
