import { z } from "zod";
export const timestamp = z.string().datetime({ offset: true });
const identifier = z.string().min(1);
const asset = z
  .string()
  .regex(/^\/api\/v1\/assets\/(?:[0-9a-f]{32}|[0-9a-f]{64})\.png$/);
const image = z.object({
  asset: z.string(),
  sha256: z.string(),
  width: z.number(),
  height: z.number(),
});
export const runtimeSchema = z.object({
  device: z.string(),
  device_name: z.string(),
  amd_gpu: z.boolean(),
  torch_version: z.string(),
  torchvision_version: z.string(),
  hip_version: z.string().nullable(),
  encoder: z.string(),
});
export const backendProfileSchema = z.object({
  id: identifier,
  name: z.string(),
  status: z.enum(["queued", "running", "ready", "failed"]),
  created_at: timestamp,
  active_version_id: identifier.nullable(),
  validation_id: identifier.nullable(),
  error: z.string().nullable(),
});
export const backendVersionSchema = z.object({
  id: identifier,
  profile_id: identifier,
  created_at: timestamp,
  parent_version_id: identifier.nullable(),
  state: z.enum(["candidate", "approved"]),
  reference_count: z.number().int().nonnegative(),
  references: z.array(image),
  threshold: z
    .object({ value: z.number().nonnegative(), status: z.string() })
    .passthrough(),
  feedback_ids: z.array(identifier),
  evaluation_id: identifier.nullable(),
});
export const backendFeedbackSchema = z.object({
  id: identifier,
  inspection_id: identifier,
  profile_id: identifier,
  version_id: identifier,
  image,
  label: z.enum(["normal", "anomaly", "unsure"]),
  note: z.string(),
  created_at: timestamp,
});
export const gateSchema = z.object({
  passed: z.boolean(),
  improved: z.boolean(),
  rule: z.string(),
});
export const metricsSchema = z.object({
  count: z.number().int(),
  normal_count: z.number().int(),
  anomaly_count: z.number().int(),
  auroc: z.number().nullable(),
  f1: z.number(),
  false_positive_rate: z.number().nullable(),
  recall: z.number().nullable(),
  true_positive: z.number().int(),
  false_negative: z.number().int(),
  false_positive: z.number().int(),
  true_negative: z.number().int(),
  threshold: z.number(),
  decision_rule: z.string(),
});
export const evaluationSchema = z.object({
  id: identifier,
  profile_id: identifier,
  version_id: identifier,
  baseline_version_id: identifier,
  validation_id: identifier,
  created_at: timestamp,
  baseline: metricsSchema,
  candidate: metricsSchema,
  gate: gateSchema,
  runtime: runtimeSchema,
  purpose: z.literal("validation_for_version_selection_not_final_test"),
  samples: z.array(
    z.object({
      sha256: z.string(),
      label: z.number(),
      baseline_score: z.number(),
      candidate_score: z.number(),
    }),
  ),
});
export const backendJobSchema = z.object({
  id: identifier,
  operation: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  result: z
    .object({
      profile_id: identifier.optional(),
      version_id: identifier.optional(),
      inspection_id: identifier.optional(),
      evaluation_id: identifier.optional(),
      state: z.string().optional(),
      gate: gateSchema.optional(),
    })
    .passthrough()
    .nullable(),
  error: z.string().nullable(),
  created_at: timestamp,
});
export const acceptedSchema = z.object({
  job_id: identifier,
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  resource_id: identifier.nullable(),
  job_url: z.string(),
});
export const backendInspectionSchema = z.object({
  id: identifier,
  profile_id: identifier,
  version_id: identifier,
  status: z.literal("ready"),
  created_at: timestamp,
  finished_at: timestamp,
  image_url: asset,
  heatmap_url: asset,
  overlay_url: asset,
  reference_url: asset,
  anomaly_score: z.number().nonnegative(),
  threshold: z.number().nonnegative(),
  threshold_status: z.string(),
  inference_ms: z.number().nonnegative(),
  decision: z.enum(["normal", "anomaly", "review"]),
  runtime: runtimeSchema,
  matches_reference_image: z.boolean(),
});
export const validationSchema = z.object({
  id: identifier,
  profile_id: identifier,
  created_at: timestamp,
  baseline_version_id: identifier,
  samples: z.array(z.object({ image, label: z.number() })),
});
export type BackendProfile = z.infer<typeof backendProfileSchema>;
export type BackendVersion = z.infer<typeof backendVersionSchema>;
export type BackendFeedback = z.infer<typeof backendFeedbackSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
