import { ApiError } from "./api";
import type {
  AssistiveReport,
  Inspection,
  InspectionReports,
} from "./contract";

/** An old or mismatched description must never be attached to the current part. */
export function reportForInspection(
  report: AssistiveReport,
  inspection: Pick<Inspection, "id" | "profile_id" | "model_decision">,
): AssistiveReport {
  const decisions = {
    normal: "pass",
    anomaly: "fail",
    review: "review",
  } as const;
  if (
    report.inspection_id !== inspection.id ||
    report.profile_id !== inspection.profile_id ||
    decisions[report.model_decision] !== inspection.model_decision
  ) {
    throw new ApiError(
      "The description does not match this inspection and its detector result. Refresh to check the saved report.",
      502,
      "invalid_response",
    );
  }
  return report;
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** Saved reports have no job_id. Resume read-only polling without another model request. */
export async function waitForReport(
  api: InspectionReports,
  initial: AssistiveReport,
  onUpdate: (report: AssistiveReport) => void,
  signal: AbortSignal,
  interval = 1500,
  timeout = 10 * 60_000,
): Promise<AssistiveReport> {
  const start = Date.now();
  let report = initial;
  while (!signal.aborted) {
    onUpdate(report);
    if (report.status === "ready" || report.status === "failed") return report;
    if (Date.now() - start >= timeout)
      throw new ApiError(
        "Checking stopped because this description is taking too long. It may still be processing. Check the saved description before generating another.",
        408,
        "report_timeout",
      );
    await pause(interval, signal);
    const next = await api.get(initial.id, signal);
    if (
      next.id !== initial.id ||
      next.inspection_id !== initial.inspection_id ||
      next.profile_id !== initial.profile_id
    )
      throw new ApiError(
        "The service returned a different description while processing.",
        502,
        "invalid_response",
      );
    report = next;
  }
  throw new DOMException("Aborted", "AbortError");
}
