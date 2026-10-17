import type { AssistiveReport, Inspection, WorksightApi } from "./contract";
import { ApiError } from "./api";
import { reportForInspection } from "./reports";

/** Config stores only a pointer; all images, decisions and generated text come from FastAPI. */
export async function loadSavedExample(
  api: WorksightApi,
  id: string,
  signal: AbortSignal,
): Promise<{
  inspection: Inspection;
  report: Extract<AssistiveReport, { status: "ready" }>;
}> {
  signal.throwIfAborted();
  if (!api.reports)
    throw new ApiError(
      "Saved AI descriptions are not supported by this service.",
      503,
    );
  const [inspection, report] = await Promise.all([
    api.inspection(id, signal),
    api.reports.latest(id, signal),
  ]);
  signal.throwIfAborted();
  if (inspection.id !== id)
    throw new ApiError(
      "The saved inspection does not match the configured example.",
      502,
      "invalid_response",
    );
  if (!report || report.status !== "ready")
    throw new ApiError(
      "This saved inspection does not have a completed AI description yet.",
      409,
      "example_not_ready",
    );
  reportForInspection(report, inspection);
  return { inspection, report };
}
