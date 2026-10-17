import { z } from "zod";
import { ApiError } from "./api";
import { profileSchema, inspectionSchema, type Profile, type Decision, type WorksightApi, type ProfileVersion, type Job, type ProfileFeedback } from "./contract";
import { backendProfileSchema, backendVersionSchema, backendFeedbackSchema, backendInspectionSchema, backendJobSchema, acceptedSchema, evaluationSchema, validationSchema, type BackendProfile, type BackendVersion, type BackendFeedback } from "./backend-contract";
import { validateFiles, validateImages } from "./files";

export const backendLimits = { max_file_bytes: 10 * 1024 * 1024, max_files: 50, min_reference_files: 3, max_image_pixels: 16_000_000, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] };
export const modelDecision = { normal: "pass", anomaly: "fail", review: "review" } as const;
export const feedbackLabel = { pass: "normal", fail: "anomaly", review: "unsure" } as const;
export function mapFeedback(record: BackendFeedback): ProfileFeedback {
  return { id: record.id, inspection_id: record.inspection_id, version_id: record.version_id, human_decision: record.label === "unsure" ? "review" : modelDecision[record.label], comment: record.note, created_at: record.created_at, image_url: `/api/v1/assets/${record.image.asset}` };
}
export function mapVersions(profile: BackendProfile, versions: BackendVersion[]): ProfileVersion[] {
  return [...versions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)).map((v, i) => ({ id: v.id, version: i + 1, created_at: v.created_at, sample_count: v.reference_count, source: v.parent_version_id ? "Engineer-confirmed references" : "Initial reference set", active: v.id === profile.active_version_id, state: v.state, parent_version_id: v.parent_version_id, evaluation_id: v.evaluation_id, threshold: v.threshold.value }));
}
export function mapProfile(record: BackendProfile, versions: BackendVersion[]): Profile {
  const active = versions.find(v => v.id === record.active_version_id);
  const numbered = mapVersions(record, versions).find(v => v.active);
  if (record.active_version_id && !active) throw new ApiError("The active profile version is missing from the service response.", 502, "invalid_response");
  return profileSchema.parse({ id: record.id, name: record.name, description: "", status: record.status === "queued" || record.status === "running" ? "building" : record.status, version: numbered?.version ?? 0, sample_count: active?.reference_count ?? 0, thumbnail_url: active?.references[0] ? `/api/v1/assets/${active.references[0].asset}` : null, updated_at: active?.created_at ?? record.created_at, active_version_id: record.active_version_id, validation_id: record.validation_id });
}
export function mapJob(value: z.infer<typeof backendJobSchema>): Job {
  return { id: value.id, status: value.status, stage: value.operation, progress: null, result: value.result, error: value.error === null ? null : { code: "processing_failed", message: value.error } };
}
export function mapInspection(record: z.infer<typeof backendInspectionSchema>, versions: ProfileVersion[], feedback: BackendFeedback[]) {
  const version = versions.find(v => v.id === record.version_id);
  if (!version) throw new ApiError("The inspection version is missing from the service response.", 502, "invalid_response");
  const review = feedback.find(f => f.inspection_id === record.id);
  return inspectionSchema.parse({ id: record.id, profile_id: record.profile_id, profile_version: version.version, version_id: record.version_id, original_url: record.image_url, heatmap_url: record.heatmap_url, overlay_url: record.overlay_url, reference_url: record.reference_url, model_decision: modelDecision[record.decision], processing_ms: record.inference_ms, created_at: record.created_at, feedback: review ? mapFeedback(review) : null, anomaly_score: record.anomaly_score, threshold: record.threshold, threshold_status: record.threshold_status, runtime: record.runtime, matches_reference_image: record.matches_reference_image });
}
export function backendErrorMessage(status: number, body: unknown): string {
  const detail = body && typeof body === "object" && "detail" in body ? body.detail : undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(item => typeof item?.msg === "string" ? item.msg : "Invalid input").join("; ");
  const error = body && typeof body === "object" && "error" in body ? body.error as { message?: unknown } : undefined;
  return typeof error?.message === "string" ? error.message : `The inspection service returned an error (${status}).`;
}
export async function backendRequest<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/backend/api/v1${path}`, { ...init, cache: "no-store", signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000) });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("The inspection service could not be reached. Check the connection and try again.", 0, "service_unavailable");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(backendErrorMessage(response.status, body), response.status, "backend_error");
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("The service returned an unexpected response. Check the backend API contract.", 502, "invalid_response");
  return parsed.data;
}
const id = encodeURIComponent;
const json = (data: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const list = <T extends z.ZodType>(schema: T) => z.object({ items: z.array(schema) });
/** Only unsent form drafts live here. Persisted domain records always come from FastAPI. */
export function createBackendApi(): WorksightApi {
  const drafts = new Map<string, { profile: Profile; files: File[]; jobId?: string }>();
  const rawVersions = async (profileId: string, signal?: AbortSignal) => (await backendRequest(`/profiles/${id(profileId)}/versions`, list(backendVersionSchema), { signal })).items;
  const rawProfile = (profileId: string, signal?: AbortSignal) => backendRequest(`/profiles/${id(profileId)}`, backendProfileSchema, { signal });
  const rawFeedback = async (profileId: string, signal?: AbortSignal) => (await backendRequest(`/profiles/${id(profileId)}/feedback`, list(backendFeedbackSchema), { signal })).items;
  const versions = async (profileId: string): Promise<ProfileVersion[]> => {
    if (drafts.has(profileId)) return [];
    const [profile, items] = await Promise.all([rawProfile(profileId), rawVersions(profileId)]);
    return mapVersions(profile, items);
  };
  const inspection = async (inspectionId: string) => {
    const record = await backendRequest(`/inspections/${id(inspectionId)}`, backendInspectionSchema);
    const [items, feedback] = await Promise.all([versions(record.profile_id), rawFeedback(record.profile_id)]);
    return mapInspection(record, items, feedback);
  };
  return {
    async capabilities() { return { api_version: "1", limits: backendLimits, features: { feedback: true, profile_updates: false, version_history: false, version_comparison: false, rollback: false } }; },
    async profiles(signal) {
      const records = (await backendRequest("/profiles", list(backendProfileSchema), { signal })).items;
      const profiles = await Promise.all(records.map(async record => mapProfile(record, await rawVersions(record.id, signal))));
      return [...profiles, ...[...drafts.values()].map(d => ({ ...d.profile }))];
    },
    async createProfile(name, _description) {
      if (!name.trim() || name.trim().length > 120) throw new ApiError("Enter a profile name of 1–120 characters.", 422);
      const profile: Profile = { id: `draft-${crypto.randomUUID()}`, name: name.trim(), description: "", status: "draft", version: 0, sample_count: 0, thumbnail_url: null, updated_at: new Date().toISOString(), local_draft: true };
      drafts.set(profile.id, { profile, files: [] });
      return { ...profile };
    },
    async uploadSamples(profileId, files) {
      const draft = drafts.get(profileId);
      if (!draft) throw new ApiError("Reference files can only be added to a new draft. Use engineer feedback to update an existing profile.", 409);
      if (draft.jobId) throw new ApiError("This draft has already been submitted. Wait for its build result.", 409);
      const next = [...draft.files, ...files];
      const issue = validateFiles(next, backendLimits); if (issue) throw new ApiError(issue, 422);
      await validateImages(files, backendLimits);
      draft.files = next;
      draft.profile = { ...draft.profile, sample_count: next.length };
      return { ...draft.profile };
    },
    async buildProfile(profileId) {
      const draft = drafts.get(profileId);
      if (!draft) throw new ApiError("Use the validated candidate workflow to update this saved profile.", 409);
      if (draft.jobId) return draft.jobId;
      if (draft.files.length < 3) throw new ApiError("Add at least 3 distinct known-good images; 10–20 are recommended.", 422);
      const body = new FormData(); body.set("name", draft.profile.name); draft.files.forEach(file => body.append("images", file));
      const accepted = await backendRequest("/profiles", acceptedSchema, { method: "POST", body });
      draft.jobId = accepted.job_id;
      drafts.delete(profileId);
      return accepted.job_id;
    },
    async job(jobId, signal) { return mapJob(await backendRequest(`/jobs/${id(jobId)}`, backendJobSchema, { signal })); },
    async inspect(profileId, image) { const body = new FormData(); body.set("image", image); return (await backendRequest(`/profiles/${id(profileId)}/inspections`, acceptedSchema, { method: "POST", body })).job_id; },
    inspection,
    async feedback(inspectionId, decision: Decision, comment) {
      try { await backendRequest(`/inspections/${id(inspectionId)}/feedback`, backendFeedbackSchema, json({ label: feedbackLabel[decision], note: comment })); }
      catch (error) { if (error instanceof ApiError && error.status === 409) throw new ApiError("This inspection already has a different engineer decision. Reviews are immutable; contact the engineer to resolve the conflict.", 409, "feedback_conflict"); throw error; }
      return inspection(inspectionId);
    },
    versions,
    async compare() { throw new ApiError("Use the candidate evaluation report to compare validated versions.", 501); },
    async rollback() { throw new ApiError("Use explicit version activation to restore an approved version.", 501); },
    workflow: {
      async profileFeedback(profileId, signal) { return (await rawFeedback(profileId, signal)).map(mapFeedback); },
      async freezeValidation(profileId, normal, anomaly) {
        if (normal.length < 5 || anomaly.length < 5 || normal.length + anomaly.length > 100) throw new ApiError("Provide at least 5 normal and 5 anomalous images, at most 100 in total.", 422);
        const body = new FormData(); normal.forEach(f => body.append("normal", f)); anomaly.forEach(f => body.append("anomaly", f));
        await backendRequest(`/profiles/${id(profileId)}/validation`, validationSchema, { method: "POST", body });
      },
      async createCandidate(profileId, feedbackIds) { return (await backendRequest(`/profiles/${id(profileId)}/candidates`, acceptedSchema, json({ feedback_ids: feedbackIds }))).job_id; },
      async evaluateCandidate(profileId, versionId) { return (await backendRequest(`/profiles/${id(profileId)}/versions/${id(versionId)}/evaluate`, acceptedSchema, { method: "POST" })).job_id; },
      evaluation: evaluationId => backendRequest(`/evaluations/${id(evaluationId)}`, evaluationSchema),
      async activateVersion(profileId, versionId) { await backendRequest(`/profiles/${id(profileId)}/versions/${id(versionId)}/activate`, backendProfileSchema, { method: "POST" }); },
    },
  };
}
