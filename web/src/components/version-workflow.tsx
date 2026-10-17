"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Evaluation,
  Job,
  Profile,
  ProfileFeedback,
  ProfileVersion,
  WorksightApi,
} from "@/lib/contract";
import { waitForJob } from "@/lib/jobs";
import { backendLimits } from "@/lib/backend-api";
import { validateFiles } from "@/lib/files";
import { assetUrl } from "@/lib/api";
import FileDrop from "./file-drop";

type Props = {
  api: WorksightApi;
  profile: Profile;
  disabled: boolean;
  run: (
    label: string,
    work: (signal: AbortSignal) => Promise<void>,
  ) => Promise<void>;
  onJob: (job: Job) => void;
  onChanged: () => Promise<unknown>;
};
const metricNames = [
  ["count", "Validation images"],
  ["normal_count", "Normal images"],
  ["anomaly_count", "Anomalous images"],
  ["auroc", "AUROC"],
  ["f1", "F1"],
  ["false_positive_rate", "False-positive rate"],
  ["recall", "Recall"],
  ["true_positive", "True positives"],
  ["false_negative", "Missed defects"],
  ["false_positive", "False positives"],
  ["true_negative", "True negatives"],
  ["threshold", "Threshold"],
] as const;
const display = (value: number | null) =>
  value === null
    ? "Not reported"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(4);
export default function VersionWorkflow({
  api,
  profile,
  disabled,
  run,
  onJob,
  onChanged,
}: Props) {
  const workflow = api.workflow!;
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [feedback, setFeedback] = useState<ProfileFeedback[]>([]);
  const [feedbackIds, setFeedbackIds] = useState<string[]>([]);
  const [normal, setNormal] = useState<File[]>([]);
  const [anomaly, setAnomaly] = useState<File[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [report, setReport] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const [v, f] = await Promise.all([
        api.versions(profile.id),
        workflow.profileFeedback(profile.id, signal),
      ]);
      if (!alive.current || signal?.aborted) return;
      setVersions(v);
      setFeedback(f);
      setFeedbackIds((current) =>
        current.filter((id) =>
          f.some((item) => item.id === id && item.human_decision === "pass"),
        ),
      );
    },
    [api, workflow, profile.id],
  );
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void reload(controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [reload, profile.active_version_id, profile.validation_id]);
  const eligible = feedback.filter((f) => f.human_decision === "pass");
  const candidate = versions.find((v) => v.id === report?.version_id);
  const baseline = versions.find((v) => v.id === report?.baseline_version_id);
  const canApply =
    report?.gate.passed === true &&
    candidate?.state === "candidate" &&
    report.baseline_version_id === profile.active_version_id;
  const frozen = !!profile.validation_id;
  async function freeze() {
    const issue = validateFiles([...normal, ...anomaly], {
      ...backendLimits,
      max_files: 100,
    });
    if (issue) {
      setError(issue);
      return;
    }
    await run("Freezing validation set", async () => {
      await workflow.freezeValidation(profile.id, normal, anomaly);
      setNormal([]);
      setAnomaly([]);
      setAcknowledged(false);
      await onChanged();
      setNotice("Validation set saved and frozen on the service.");
    });
  }
  async function evaluate(version: ProfileVersion) {
    if (!version.id) return;
    await run(`Evaluating v${version.version}`, async (signal) => {
      const jobId = await workflow.evaluateCandidate(profile.id, version.id!);
      const job = await waitForJob(api, jobId, onJob, signal);
      if (!job.result?.evaluation_id)
        throw new Error("The service did not return an evaluation ID.");
      const result = await workflow.evaluation(job.result.evaluation_id);
      if (result.profile_id !== profile.id || result.version_id !== version.id)
        throw new Error(
          "The service returned an evaluation for a different version.",
        );
      setReport(result);
      await reload();
      setNotice(
        "Evaluation complete. Review measured results before applying the version.",
      );
    });
  }
  async function activate(version: ProfileVersion, restore = false) {
    if (!version.id) return;
    if (
      !window.confirm(
        `${restore ? "Restore" : "Apply"} profile v${version.version}? Existing inspection records keep their original version.`,
      )
    )
      return;
    await run(
      restore ? "Restoring profile version" : "Applying validated version",
      async () => {
        await workflow.activateVersion(profile.id, version.id!);
        await onChanged();
        await reload();
        setNotice(
          `v${version.version} is active. Run a new inspection to use it.`,
        );
      },
    );
  }
  return (
    <section
      className="version-workflow"
      aria-label="Profile validation and versions"
    >
      <div className="section-heading">
        <h2>Validation & versions</h2>
        <button
          className="text-button"
          disabled={disabled || loading}
          onClick={() =>
            void run("Refreshing versions", async () => {
              await reload();
              await onChanged();
              setError("");
            })
          }
        >
          Refresh versions
        </button>
      </div>
      {loading && (
        <p className="section-copy" role="status">
          Loading versions and engineer feedback…
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workflow-notice" role="status">
          {notice}
        </p>
      )}
      <details className="workflow-step" open={!frozen}>
        <summary>
          1. Validation images{" "}
          {frozen ? "· Frozen" : "· Required before evaluation"}
        </summary>
        {frozen ? (
          <p className="section-copy">
            This profile has a frozen validation set. It cannot be replaced.
            Validation images stay separate from reference and feedback images.
          </p>
        ) : (
          <>
            <p className="section-copy">
              Upload at least 5 normal and 5 anomalous images, up to 100 total.
              Use distinct images that have never been references or engineer
              feedback. This set is frozen once saved; create another profile
              for a different experiment. Keep a separate final test set.
            </p>
            <div className="validation-uploads">
              <div>
                <h3>Normal validation images</h3>
                <FileDrop
                  label="Normal validation images"
                  files={normal}
                  onChange={setNormal}
                  multiple
                  disabled={disabled}
                  limits={{ ...backendLimits, max_files: 95 }}
                />
              </div>
              <div>
                <h3>Anomalous validation images</h3>
                <FileDrop
                  label="Anomalous validation images"
                  files={anomaly}
                  onChange={setAnomaly}
                  multiple
                  disabled={disabled}
                  limits={{ ...backendLimits, max_files: 95 }}
                />
              </div>
            </div>
            <label className="workflow-check">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={disabled}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I understand this validation set will be frozen and cannot be
                replaced.
              </span>
            </label>
            <button
              className="button secondary"
              disabled={
                disabled ||
                !acknowledged ||
                normal.length < 5 ||
                anomaly.length < 5 ||
                normal.length + anomaly.length > 100
              }
              onClick={() => void freeze()}
            >
              Save and freeze validation set
            </button>
          </>
        )}
      </details>
      <div className="workflow-step">
        <h3>2. Engineer-confirmed references</h3>
        <p className="section-copy">
          Only confirmed-normal feedback can enter reference memory. Select new
          examples, build a candidate, then evaluate it before activation.
          Defective and unsure labels are never added as good references.
        </p>
        {!eligible.length && !loading && (
          <p className="empty-copy">
            No confirmed-normal feedback yet. Inspect a new acceptable part and
            save a Pass decision first.
          </p>
        )}
        <div className="feedback-options">
          {eligible.map((f) => (
            <label className="feedback-option" key={f.id}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={feedbackIds.includes(f.id)}
                onChange={(e) =>
                  setFeedbackIds((ids) =>
                    e.target.checked
                      ? [...ids, f.id]
                      : ids.filter((id) => id !== f.id),
                  )
                }
              />
              <img
                src={assetUrl(f.image_url)}
                alt="Engineer-confirmed normal part"
              />
              <span>
                <strong>{f.comment || "Confirmed normal"}</strong>
                <small>
                  {new Date(f.created_at).toLocaleString("en-GB")} · Inspection{" "}
                  {f.inspection_id}
                </small>
              </span>
            </label>
          ))}
        </div>
        <button
          className="button secondary"
          disabled={disabled || !frozen || !feedbackIds.length}
          onClick={() =>
            void run("Building candidate version", async (signal) => {
              const jobId = await workflow.createCandidate(
                profile.id,
                feedbackIds,
              );
              const job = await waitForJob(api, jobId, onJob, signal);
              if (
                job.result?.profile_id !== profile.id ||
                !job.result.version_id
              )
                throw new Error(
                  "The service did not return the expected candidate version.",
                );
              await reload();
              setReport(null);
              setFeedbackIds([]);
              setNotice(
                "Candidate built. Evaluate it on the frozen validation set; the active version has not changed.",
              );
            })
          }
        >
          Build candidate ({feedbackIds.length})
        </button>
        {!frozen && (
          <p className="small-note">Save a frozen validation set first.</p>
        )}
      </div>
      <div className="workflow-step">
        <h3>3. Version history</h3>
        {!versions.length && !loading && <p>No version records available.</p>}
        {versions.map((v) => (
          <div className="version-row" key={v.id}>
            <div>
              <strong>
                v{v.version}
                {v.active ? " · Active" : ""} · {v.state}
              </strong>
              <p>
                {v.sample_count} references ·{" "}
                {new Date(v.created_at).toLocaleString("en-GB")}
              </p>
            </div>
            <div className="version-actions">
              {v.state === "candidate" && (
                <button
                  className="text-button"
                  disabled={
                    disabled ||
                    !frozen ||
                    v.parent_version_id !== profile.active_version_id
                  }
                  onClick={() => void evaluate(v)}
                >
                  Evaluate v{v.version}
                </button>
              )}
              {v.evaluation_id && (
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    void run("Loading evaluation report", async () => {
                      const result = await workflow.evaluation(
                        v.evaluation_id!,
                      );
                      if (
                        result.profile_id !== profile.id ||
                        result.version_id !== v.id
                      )
                        throw new Error(
                          "Evaluation does not belong to this version.",
                        );
                      setReport(result);
                    })
                  }
                >
                  View report v{v.version}
                </button>
              )}
              {v.state === "approved" && !v.active && (
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => void activate(v, true)}
                >
                  Restore v{v.version}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {report && (
        <section
          className="evaluation-report"
          aria-label="Candidate evaluation"
        >
          <h3>
            Evaluation · v{baseline?.version ?? "?"} → v
            {candidate?.version ?? "?"}
          </h3>
          <p
            className={`gate-result ${report.gate.passed ? "passed" : "rejected"}`}
          >
            {report.gate.passed
              ? report.gate.improved
                ? "Passed · improvement measured on validation"
                : "Passed · no regression on validation"
              : "Rejected · regression on validation"}
          </p>
          <p className="section-copy">{report.gate.rule}</p>
          <p className="small-note">
            Frozen validation results for version selection. These are not final
            test metrics. Binary metrics exclude the review band.
          </p>
          <div className="metrics-scroll">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Baseline v{baseline?.version}</th>
                  <th>Candidate v{candidate?.version}</th>
                </tr>
              </thead>
              <tbody>
                {metricNames.map(([key, name]) => (
                  <tr key={key}>
                    <td>{name}</td>
                    <td>{display(report.baseline[key])}</td>
                    <td>{display(report.candidate[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small-note">
            Runtime:{" "}
            {report.runtime.amd_gpu
              ? `AMD GPU · ${report.runtime.device_name}`
              : report.runtime.device === "cpu"
                ? "CPU"
                : report.runtime.device_name}
            . Report {report.id}
          </p>
          {candidate?.state === "candidate" && (
            <button
              className="button primary"
              disabled={disabled || !canApply}
              onClick={() => void activate(candidate)}
            >
              Apply v{candidate.version}
            </button>
          )}
          {!report.gate.passed && (
            <p className="small-note">
              Applying this candidate is blocked because the validation gate
              failed.
            </p>
          )}
          {report.baseline_version_id !== profile.active_version_id &&
            candidate?.state === "candidate" && (
              <p className="small-note">
                The active version changed. Build and evaluate a new candidate.
              </p>
            )}
        </section>
      )}
    </section>
  );
}
