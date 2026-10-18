import { z } from "zod";
import { backendRequest } from "./backend-api";
import { ApiError } from "./api";

// History, batch inspection and part documents: live backend routes the main client does not map.

const decision = z.enum(["normal", "review", "anomaly"]);

const historyItem = z
  .object({
    id: z.string(),
    created_at: z.string(),
    status: z.string(),
    decision: decision.nullable().optional(),
    anomaly_score: z.number().nullable().optional(),
    feedback_label: z
      .enum(["normal", "anomaly", "unsure"])
      .nullable()
      .optional(),
    filename: z.string().nullable().optional(),
  })
  .passthrough();
export type HistoryItem = z.infer<typeof historyItem>;

const historyPage = z.object({
  items: z.array(historyItem),
  next_cursor: z.string().nullable(),
});

export function history(
  profileId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return backendRequest(
    `/profiles/${encodeURIComponent(profileId)}/inspections?${query}`,
    historyPage,
    { signal },
  );
}

const accepted = z.object({ job_id: z.string() }).passthrough();
const job = z
  .object({
    status: z.string(),
    error: z
      .object({ message: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

async function waitFor(
  jobId: string,
  signal: AbortSignal,
  onTick?: () => Promise<void>,
) {
  for (;;) {
    const current = await backendRequest(
      `/jobs/${encodeURIComponent(jobId)}`,
      job,
      { signal },
    );
    await onTick?.();
    if (current.status === "succeeded") return;
    if (current.status === "failed" || current.status === "cancelled")
      throw new ApiError(
        current.error?.message ?? "Processing failed.",
        422,
        "processing_failed",
      );
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  }
}

const batchItem = z
  .object({
    inspection_id: z.string().nullable().optional(),
    filename: z.string().nullable().optional(),
    status: z.string(),
    decision: decision.nullable().optional(),
    anomaly_score: z.number().nullable().optional(),
  })
  .passthrough();
const batch = z
  .object({
    id: z.string(),
    status: z.string(),
    total: z.number(),
    processed: z.number(),
    counts: z.record(z.string(), z.number()),
    items: z.array(batchItem),
  })
  .passthrough();
export type Batch = z.infer<typeof batch>;

export async function runBatch(
  profileId: string,
  files: File[],
  onUpdate: (b: Batch) => void,
  signal: AbortSignal,
) {
  const form = new FormData();
  for (const file of files) form.append("images", file, file.name);
  const started = await backendRequest(
    `/profiles/${encodeURIComponent(profileId)}/batches`,
    accepted.extend({ resource_id: z.string().nullable() }),
    { method: "POST", body: form, signal },
  );
  const batchId = started.resource_id;
  const read = async () => {
    if (batchId)
      onUpdate(
        await backendRequest(`/batches/${encodeURIComponent(batchId)}`, batch, {
          signal,
        }),
      );
  };
  await waitFor(started.job_id, signal, read);
  await read();
}

const documentRecord = z
  .object({
    id: z.string(),
    filename: z.string(),
    kind: z.string(),
    pages: z.number().nullable().optional(),
    chars: z.number(),
    created_at: z.string(),
    excerpt: z.string().optional(),
  })
  .passthrough();
export type PartDocument = z.infer<typeof documentRecord>;

export function documents(profileId: string, signal?: AbortSignal) {
  return backendRequest(
    `/profiles/${encodeURIComponent(profileId)}/documents`,
    z.object({ items: z.array(documentRecord) }),
    { signal },
  );
}

export function addDocument(
  profileId: string,
  file: File,
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("file", file, file.name);
  return backendRequest(
    `/profiles/${encodeURIComponent(profileId)}/documents`,
    documentRecord,
    {
      method: "POST",
      body: form,
      signal,
    },
  );
}
