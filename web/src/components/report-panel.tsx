"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { backendRequest } from "@/lib/backend-api";

const reportSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "ready", "failed"]),
  summary: z.string().optional(),
  observations: z.array(z.string()).optional(),
  suggested_check: z.string().nullable().optional(),
  relevant_requirements: z.array(z.string()).optional(),
  heatmap_consistency: z.string().optional(),
  model: z.string().optional(),
  documents_used: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});
type Report = z.infer<typeof reportSchema>;
const accepted = z.object({ resource_id: z.string().nullable() });
const consistency: Record<string, string> = {
  consistent: "matches the heatmap",
  partly_consistent: "partly matches the heatmap",
  inconsistent: "does not match the heatmap",
  unclear: "unclear against the heatmap",
};

/** Assistive AI description from AMD Token Factory. Never changes the model or engineer decision. */
export function ReportPanel({ inspectionId }: { inspectionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useRef<AbortController | null>(null);

  const poll = useCallback(async (reportId: string) => {
    stop.current?.abort();
    const controller = new AbortController();
    stop.current = controller;
    setBusy(true);
    try {
      for (let i = 0; i < 90 && !controller.signal.aborted; i++) {
        const next = await backendRequest(
          `/reports/${encodeURIComponent(reportId)}`,
          reportSchema,
          { signal: controller.signal },
        );
        setReport(next);
        if (next.status === "ready" || next.status === "failed") return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Could not load the AI description.",
        );
    } finally {
      if (stop.current === controller) setBusy(false);
    }
  }, []);

  useEffect(() => {
    setReport(null);
    setError(null);
    const controller = new AbortController();
    backendRequest(
      `/inspections/${encodeURIComponent(inspectionId)}/report`,
      reportSchema,
      { signal: controller.signal },
    )
      .then((existing) => {
        setReport(existing);
        if (existing.status === "queued" || existing.status === "running")
          void poll(existing.id);
      })
      .catch((e) => {
        if (
          !(e instanceof ApiError && e.status === 404) &&
          !controller.signal.aborted
        )
          setError(
            e instanceof Error
              ? e.message
              : "Could not load the AI description.",
          );
      });
    return () => {
      controller.abort();
      stop.current?.abort();
    };
  }, [inspectionId, poll]);

  const request = async (refresh: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const job = await backendRequest(
        `/inspections/${encodeURIComponent(inspectionId)}/report${refresh ? "?refresh=true" : ""}`,
        accepted,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": refresh
              ? `report-${inspectionId}-${Date.now()}`
              : `report-${inspectionId}`,
          },
        },
      );
      if (job.resource_id) await poll(job.resource_id);
    } catch (e) {
      // 429 and 503 carry a reason; show it and let the engineer decide. No automatic retry.
      setError(
        e instanceof Error
          ? e.message
          : "Could not request the AI description.",
      );
    } finally {
      setBusy(false);
    }
  };

  const pending = report?.status === "queued" || report?.status === "running";
  return (
    <section className="sidebar-section report-panel" aria-live="polite">
      <div className="section-heading">
        <h2>AI description</h2>
        <span className="saved-tag">Assistive</span>
      </div>
      <p className="small-note">
        A vision-language model on AMD Token Factory describes the image,
        heatmap and reference. It does not change the model result or your
        review.
      </p>
      {report?.status === "ready" && (
        <div className="report-body">
          <p className="section-copy">{report.summary}</p>
          {!!report.observations?.length && (
            <ul>
              {report.observations.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
          {report.suggested_check && (
            <p className="section-copy">
              <strong>Check first:</strong> {report.suggested_check}
            </p>
          )}
          {!!report.relevant_requirements?.length && (
            <>
              <p className="field-label">From the part documentation</p>
              <ul>
                {report.relevant_requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          <p className="small-note">
            {report.model} on AMD Token Factory
            {report.heatmap_consistency &&
              ` · description ${consistency[report.heatmap_consistency] ?? report.heatmap_consistency} (not a confidence)`}
            . The text can be wrong; the engineer decides.
          </p>
        </div>
      )}
      {report?.status === "failed" && (
        <p className="reference-warning" role="alert">
          {report.error ?? "The AI description failed."}
        </p>
      )}
      {error && (
        <p className="reference-warning" role="alert">
          {error}
        </p>
      )}
      <button
        className="button full"
        type="button"
        disabled={busy || pending}
        onClick={() =>
          void request(
            report?.status === "ready" || report?.status === "failed",
          )
        }
      >
        {busy || pending
          ? "Describing… (up to a minute)"
          : report?.status === "ready"
            ? "Regenerate AI description"
            : report?.status === "failed"
              ? "Try AI description again"
              : "Generate AI description"}
      </button>
    </section>
  );
}
