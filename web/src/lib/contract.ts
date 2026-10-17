import { z } from "zod";

export const decisionSchema = z.enum(["pass", "fail", "review"]);
export type Decision = z.infer<typeof decisionSchema>;
export const profileSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(),
  status: z.enum(["draft", "building", "ready", "failed"]),
  version: z.number().int().nonnegative(), sample_count: z.number().int().nonnegative(),
  thumbnail_url: z.string().nullable(), updated_at: z.string().datetime(),
});
export type Profile = z.infer<typeof profileSchema>;
export const capabilitiesSchema = z.object({
  api_version: z.literal("1"),
  limits: z.object({ max_file_bytes: z.number().positive(), max_files: z.number().int().positive(), allowed_mime_types: z.array(z.string()) }),
  features: z.object({ feedback: z.boolean(), profile_updates: z.boolean(), version_history: z.boolean(), version_comparison: z.boolean(), rollback: z.boolean() }),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export const jobSchema = z.object({
  id: z.string(), status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  stage: z.string().nullable(), progress: z.number().min(0).max(1).nullable(),
  result: z.object({ profile_id: z.string().optional(), inspection_id: z.string().optional() }).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type Job = z.infer<typeof jobSchema>;
export const feedbackSchema = z.object({ id: z.string(), human_decision: decisionSchema, comment: z.string(), created_at: z.string().datetime() });
export const inspectionSchema = z.object({
  id: z.string(), profile_id: z.string(), profile_version: z.number().int().positive(),
  original_url: z.string(), heatmap_url: z.string().nullable(), reference_url: z.string().nullable(),
  model_decision: decisionSchema, processing_ms: z.number().nonnegative().nullable(),
  created_at: z.string().datetime(), feedback: feedbackSchema.nullable(),
});
export type Inspection = z.infer<typeof inspectionSchema>;
export const versionSchema = z.object({ version: z.number().int().positive(), created_at: z.string().datetime(), sample_count: z.number().int().nonnegative(), source: z.string(), active: z.boolean() });
export type ProfileVersion = z.infer<typeof versionSchema>;
export const comparisonSchema = z.object({ from_version: z.number().int().positive(), to_version: z.number().int().positive(), summary: z.string(), metrics: z.array(z.object({ name: z.string(), before: z.number().nullable(), after: z.number().nullable(), unit: z.string() })) });
export type VersionComparison = z.infer<typeof comparisonSchema>;
export type Mode = "demo" | "live" | "unconfigured";
export interface WorksightApi {
  capabilities(signal?: AbortSignal): Promise<Capabilities>;
  profiles(signal?: AbortSignal): Promise<Profile[]>;
  createProfile(name: string, description: string): Promise<Profile>;
  uploadSamples(id: string, files: File[]): Promise<Profile>;
  buildProfile(id: string): Promise<string>;
  job(id: string, signal?: AbortSignal): Promise<Job>;
  inspect(profileId: string, image: File): Promise<string>;
  inspection(id: string): Promise<Inspection>;
  feedback(id: string, decision: Decision, comment: string): Promise<Inspection>;
  versions(id: string): Promise<ProfileVersion[]>;
  compare(id: string, from: number, to: number): Promise<VersionComparison>;
  rollback(id: string, version: number): Promise<string>;
}
