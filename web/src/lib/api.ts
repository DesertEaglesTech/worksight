import { z } from "zod";
import { capabilitiesSchema, comparisonSchema, inspectionSchema, jobSchema, profileSchema, versionSchema, type WorksightApi } from "./contract";

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = "request_failed") { super(message); this.name = "ApiError"; }
}
export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const timeout = AbortSignal.timeout(45_000);
  try {
    response = await fetch(`/api/backend/v1${path}`, { ...init, cache: "no-store", signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("The inspection service could not be reached. Check the connection and try again.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "request_failed";
    const message = typeof body?.error?.message === "string" ? body.error.message : `The service returned an error (${response.status}).`;
    throw new ApiError(message, response.status, code);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError("The service returned an unexpected response. The API contract may have changed.", response.status, "invalid_response");
  return result.data;
}
const accepted = z.object({ job_id: z.string() });
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const id = encodeURIComponent;
export const liveApi: WorksightApi = {
  capabilities: signal => request("/capabilities", capabilitiesSchema, { signal }),
  profiles: signal => request("/profiles", z.object({ items: z.array(profileSchema) }), { signal }).then(r => r.items),
  createProfile: (name, description) => request("/profiles", profileSchema, json({ name, description })),
  uploadSamples: (profileId, files) => { const body = new FormData(); files.forEach(f => body.append("files", f)); return request(`/profiles/${id(profileId)}/samples`, profileSchema, { method: "POST", body }); },
  buildProfile: profileId => request(`/profiles/${id(profileId)}/build`, accepted, json({})).then(r => r.job_id),
  job: (jobId, signal) => request(`/jobs/${id(jobId)}`, jobSchema, { signal }),
  inspect: (profileId, image) => { const body = new FormData(); body.set("profile_id", profileId); body.set("image", image); return request("/inspections", accepted, { method: "POST", body }).then(r => r.job_id); },
  inspection: inspectionId => request(`/inspections/${id(inspectionId)}`, inspectionSchema),
  feedback: (inspectionId, human_decision, comment) => request(`/inspections/${id(inspectionId)}/feedback`, inspectionSchema, json({ human_decision, comment })),
  versions: profileId => request(`/profiles/${id(profileId)}/versions`, z.object({ items: z.array(versionSchema) })).then(r => r.items),
  compare: (profileId, from, to) => request(`/profiles/${id(profileId)}/compare?from=${from}&to=${to}`, comparisonSchema),
  rollback: (profileId, version) => request(`/profiles/${id(profileId)}/rollback`, accepted, json({ version })).then(r => r.job_id),
};
/** Only proxy known relative asset paths. Signed HTTPS URLs may be supplied by the backend. */
export function assetUrl(value: string): string {
  if (/^\/v1\/assets\/[a-zA-Z0-9_.-]+$/.test(value)) return `/api/backend${value}`;
  if (value.startsWith("/demo/")) return value;
  try { const url = new URL(value); if (url.protocol === "https:") return url.href; } catch { /* reject */ }
  return "";
}
