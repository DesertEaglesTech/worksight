"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type {
  AssistiveReport,
  Inspection,
  Job,
  WorksightApi,
} from "@/lib/contract";
import { waitForJob } from "@/lib/jobs";
import { reportForInspection, waitForReport } from "@/lib/reports";

const consistency = {
  consistent: "Consistent",
  partly_consistent: "Partly consistent",
  inconsistent: "Inconsistent",
  unclear: "Unclear",
};
const time = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function DescriptionContent({
  report,
}: {
  report: Extract<AssistiveReport, { status: "ready" }>;
}) {
  return (
    <div className="ai-report-content" data-report-id={report.id}>
      <p className="ai-report-attribution">
        {report.model} · Runs on {report.provider}
      </p>
      <p className="ai-report-summary">
        {report.summary || "The service returned no summary."}
      </p>
      <div className="ai-report-columns">
        <div>
          <h3>Visible observations</h3>
          {report.observations.length ? (
            <ul>
              {report.observations.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>No visible observations were reported.</p>
          )}
        </div>
        <div>
          <h3>Suggested engineer check</h3>
          <p>{report.suggested_check || "No specific check was suggested."}</p>
          <p className="ai-report-consistency">
            AI view of heatmap consistency:{" "}
            <strong>{consistency[report.heatmap_consistency]}</strong>
          </p>
        </div>
      </div>
      <details className="ai-report-metadata">
        <summary>Report details</summary>
        <dl className="detail-list">
          <div>
            <dt>Report created</dt>
            <dd>{time(report.created_at)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{time(report.finished_at)}</dd>
          </div>
          <div>
            <dt>Requested model</dt>
            <dd>{report.model}</dd>
          </div>
          {report.served_model && (
            <div>
              <dt>Served model</dt>
              <dd>{report.served_model}</dd>
            </div>
          )}
          <div>
            <dt>Model response time</dt>
            <dd>
              {(report.latency_ms / 1000).toLocaleString("en-GB", {
                maximumFractionDigits: 1,
              })}{" "}
              s
            </dd>
          </div>
          {report.usage.total_tokens !== null && (
            <div>
              <dt>Reported tokens</dt>
              <dd>{report.usage.total_tokens}</dd>
            </div>
          )}
          <div>
            <dt>Report ID</dt>
            <dd>{report.id}</dd>
          </div>
        </dl>
        {report.failed_attempts.length > 0 && (
          <>
            <h3>Earlier model attempts</h3>
            <ul>
              {report.failed_attempts.map((attempt, i) => (
                <li key={i}>
                  {attempt.model}: {attempt.error}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  );
}
export default function AiDescription({
  api,
  inspection,
  disabled,
}: {
  api: WorksightApi;
  inspection: Inspection;
  disabled: boolean;
}) {
  const reports = api.reports!;
  const [report, setReport] = useState<AssistiveReport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(true);
  const [phase, setPhase] = useState("Checking saved description…");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const failedRequest = useRef(false);
  const inspectRef = useRef(inspection);
  inspectRef.current = inspection;
  const accept = (value: AssistiveReport) => {
    const checked = reportForInspection(value, inspectRef.current);
    setReport(checked);
    return checked;
  };
  async function load(signal: AbortSignal) {
    const [available, latest] = await Promise.all([
      reports.availability(signal),
      reports.latest(inspection.id, signal),
    ]);
    if (signal.aborted) return;
    setEnabled(available.enabled);
    if (latest) {
      const saved = accept(latest);
      if (saved.status === "queued" || saved.status === "running") {
        setPhase("Checking saved description…");
        await waitForReport(reports, saved, accept, signal);
      }
    } else setReport(null);
    if (!signal.aborted) failedRequest.current = false;
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    inFlight.current = true;
    void load(current.signal)
      .catch((e) => {
        if (!current.signal.aborted) {
          setError(e.message);
          failedRequest.current = true;
        }
      })
      .finally(() => {
        if (!current.signal.aborted) {
          setWorking(false);
          inFlight.current = false;
        }
      });
    return () => {
      current.abort();
      controller.current?.abort();
    };
    // The parent keys this component by immutable inspection ID. Feedback updates do not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, inspection.id]);
  async function checkSaved() {
    if (inFlight.current) return;
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    inFlight.current = true;
    setWorking(true);
    setJob(null);
    setError("");
    setPhase("Checking saved description…");
    try {
      await load(current.signal);
    } catch (e) {
      if (!current.signal.aborted) {
        setError((e as Error).message);
        failedRequest.current = true;
      }
    } finally {
      if (!current.signal.aborted) {
        inFlight.current = false;
        setWorking(false);
      }
    }
  }
  async function generate() {
    if (inFlight.current || !enabled || failedRequest.current) return;
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    inFlight.current = true;
    setWorking(true);
    setJob(null);
    setError("");
    setPhase("Submitting description request…");
    let reportId: string | null = null;
    try {
      const accepted = await reports.request(inspection.id, current.signal);
      reportId = accepted.report_id;
      setReport(null);
      setPhase("Generating description…");
      const done = await waitForJob(
        api,
        accepted.job_id,
        (value) => {
          if (!current.signal.aborted) setJob(value);
        },
        current.signal,
      );
      if (
        done.result?.report_id !== reportId ||
        done.result.inspection_id !== inspection.id
      )
        throw new Error(
          "The service returned a description for a different inspection.",
        );
      if (!current.signal.aborted) {
        const saved = accept(await reports.get(reportId, current.signal));
        if (saved.status === "queued" || saved.status === "running")
          await waitForReport(reports, saved, accept, current.signal);
      }
    } catch (e) {
      if (!current.signal.aborted) {
        setError((e as Error).message);
        failedRequest.current = true;
        if (reportId) {
          try {
            const saved = accept(await reports.get(reportId, current.signal));
            if (saved.status === "failed" || saved.status === "ready")
              failedRequest.current = false;
          } catch {
            /* Keep the original error; do not repeat the model request. */
          }
        }
      }
    } finally {
      if (!current.signal.aborted) {
        inFlight.current = false;
        setWorking(false);
      }
    }
  }
  const pending =
    working || report?.status === "queued" || report?.status === "running";
  return (
    <section
      id="ai-description"
      tabIndex={-1}
      className="ai-description"
      aria-label="AI description (assistive)"
    >
      <div className="ai-description-heading">
        <div>
          <h2>
            AI description <span>(assistive)</span>
          </h2>
          <p>Describes visible differences. The engineer makes the decision.</p>
        </div>
        <button
          className="button secondary"
          disabled={disabled || working}
          onClick={() => void checkSaved()}
        >
          Check saved description
        </button>
      </div>
      <p className="ai-sharing-note">
        Generating a description sends this part image, heatmap overlay and
        similar reference to AMD Token Factory. Use images approved for external
        processing. It does not change the detector result or the engineer
        review.
      </p>
      {working && (
        <div className="ai-report-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={20} />
          <div>
            <strong>{phase}</strong>
            <p>
              {job
                ? `Job ${job.status}`
                : report &&
                    (report.status === "queued" || report.status === "running")
                  ? `Report ${report.status}`
                  : "Waiting for the service response…"}
            </p>
            <small>
              You can continue inspecting parts. Leaving this view stops
              checking; the server may keep processing.
            </small>
          </div>
        </div>
      )}
      {!working &&
        (report?.status === "queued" || report?.status === "running") && (
          <p className="small-note">
            The saved description is still {report.status}. Check saved
            description to resume watching it.
          </p>
        )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {report?.status === "failed" && (
        <div className="ai-report-failure">
          <h3>Description could not be generated</h3>
          <p role="alert">{report.error}</p>
        </div>
      )}
      {report?.status === "ready" && <DescriptionContent report={report} />}
      {!working && !report && !error && (
        <p className="ai-report-empty">
          No AI description has been requested for this inspection.
        </p>
      )}
      {!working && !enabled && (
        <p className="small-note">
          AI descriptions are not enabled on this inspection service. Saved
          descriptions remain available.
        </p>
      )}
      <div className="ai-description-actions">
        <button
          className="button primary"
          disabled={disabled || pending || !enabled || failedRequest.current}
          onClick={() => void generate()}
        >
          {report?.status === "ready"
            ? "Generate new description"
            : report?.status === "failed"
              ? "Retry description"
              : "Generate description"}
        </button>
        <span>Optional · runs on AMD Token Factory</span>
      </div>
      {!working && failedRequest.current && (
        <p className="small-note">
          Check the saved description before sending another request.
        </p>
      )}
      {report?.status === "ready" && (
        <p className="small-note">
          AI descriptions can be incorrect. Heatmap consistency is the model’s
          description, not confidence or a pass/fail decision.
        </p>
      )}
    </section>
  );
}
