import { ApiError } from "./api";
import type { Job, WorksightApi } from "./contract";
export async function waitForJob(api: WorksightApi, id: string, onUpdate: (job: Job) => void, signal: AbortSignal, interval = 1100, timeout = 10 * 60_000): Promise<Job> {
  const start = Date.now();
  while (!signal.aborted) {
    const job = await api.job(id, signal);
    onUpdate(job);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new ApiError(job.error?.message ?? "Processing failed. You can retry this operation.", 422, job.error?.code ?? "processing_failed");
    if (job.status === "cancelled") throw new ApiError("The service cancelled this job.", 409, "cancelled");
    if (Date.now() - start > timeout) throw new ApiError(`This job is taking longer than expected. Job ID: ${id}. Checking stopped; the service may still be processing it.`, 408, "job_timeout");
    await new Promise<void>((resolve, reject) => { const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }; const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, interval); signal.addEventListener("abort", onAbort, { once: true }); });
  }
  throw new DOMException("Aborted", "AbortError");
}
