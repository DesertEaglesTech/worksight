"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  History,
  Images,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { T } from "@/lib/i18n";
import {
  addDocument,
  documents,
  history,
  runBatch,
  type Batch,
  type HistoryItem,
  type PartDocument,
} from "@/lib/extras";

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
const when = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));

function Decision({ value, t }: { value?: string | null; t: T }) {
  if (value !== "normal" && value !== "review" && value !== "anomaly")
    return <span className="tool-tag">—</span>;
  return <span className={`tool-tag ${value}`}>{t(`decision.${value}`)}</span>;
}

function HistoryTab({
  profileId,
  t,
  onOpen,
  disabled,
  refreshKey,
}: {
  profileId: string;
  t: T;
  onOpen: (id: string) => void;
  disabled: boolean;
  refreshKey: number;
}) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    async (next?: string) => {
      setLoading(true);
      setError("");
      try {
        const page = await history(profileId, next);
        setItems((current) =>
          next ? [...current, ...page.items] : page.items,
        );
        setCursor(page.next_cursor);
      } catch (e) {
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [profileId],
  );
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  return (
    <div className="tool-body">
      <div className="tool-row-actions">
        <button
          className="text-button"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> {t("history.refresh")}
        </button>
      </div>
      {error && <p className="tool-error">{error}</p>}
      {!items.length && !loading && !error && (
        <p className="tool-empty">{t("history.empty")}</p>
      )}
      {!!items.length && (
        <table className="tool-table">
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{when(item.created_at)}</td>
                <td>
                  <Decision value={item.decision} t={t} />
                </td>
                <td className="num">
                  {typeof item.anomaly_score === "number"
                    ? item.anomaly_score.toFixed(3)
                    : "—"}
                </td>
                <td>
                  {item.feedback_label
                    ? `${t("history.engineer")}: ${item.feedback_label}`
                    : ""}
                </td>
                <td className="end">
                  <button
                    className="text-button"
                    disabled={disabled || item.status !== "ready"}
                    onClick={() => onOpen(item.id)}
                  >
                    {t("history.open")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {loading && <LoaderCircle className="spin" size={20} />}
      {cursor && !loading && (
        <button className="button secondary" onClick={() => void load(cursor)}>
          {t("history.more")}
        </button>
      )}
    </div>
  );
}

function BatchTab({
  profileId,
  t,
  onOpen,
  disabled,
  onDone,
}: {
  profileId: string;
  t: T;
  onOpen: (id: string) => void;
  disabled: boolean;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Batch | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function start() {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      await runBatch(profileId, files, setResult, c.signal);
      onDone();
    } catch (e) {
      if (!c.signal.aborted) setError(message(e));
    } finally {
      if (!c.signal.aborted) setRunning(false);
    }
  }
  return (
    <div className="tool-body">
      <p className="tool-intro">{t("batch.intro")}</p>
      <div className="tool-row-actions">
        <label
          className={`button secondary ${disabled || running ? "disabled" : ""}`}
        >
          <Images size={16} /> {t("batch.choose")}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || running}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, 50));
              setResult(null);
            }}
          />
        </label>
        <span className="tool-muted">
          {files.length} {t("batch.selected")}
        </span>
        <button
          className="button primary"
          disabled={disabled || running || !files.length}
          onClick={() => void start()}
        >
          {running && <LoaderCircle className="spin" size={16} />}{" "}
          {t("batch.run")}
        </button>
      </div>
      {error && <p className="tool-error">{error}</p>}
      {result && (
        <>
          <p className="tool-muted">
            {t("batch.progress")}: {result.processed}/{result.total} ·{" "}
            {t("decision.anomaly")} {result.counts.anomaly ?? 0} ·{" "}
            {t("decision.review")} {result.counts.review ?? 0} ·{" "}
            {t("decision.normal")} {result.counts.normal ?? 0}
          </p>
          <table className="tool-table">
            <tbody>
              {result.items.map((item, i) => (
                <tr key={`${item.inspection_id ?? item.filename}-${i}`}>
                  <td className="num">{i + 1}</td>
                  <td>{item.filename ?? "—"}</td>
                  <td>
                    <Decision value={item.decision} t={t} />
                  </td>
                  <td className="num">
                    {typeof item.anomaly_score === "number"
                      ? item.anomaly_score.toFixed(3)
                      : "—"}
                  </td>
                  <td className="end">
                    {item.inspection_id && item.status === "ready" && (
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() => onOpen(item.inspection_id!)}
                      >
                        {t("history.open")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function DocumentsPanel({
  profileId,
  t,
  disabled,
}: {
  profileId: string;
  t: T;
  disabled: boolean;
}) {
  const [items, setItems] = useState<PartDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setItems((await documents(profileId)).items);
    } catch (e) {
      setError(message(e));
    }
  }, [profileId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      await addDocument(profileId, file);
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tool-body">
      <p className="tool-intro">{t("docs.intro")}</p>
      <div className="tool-row-actions">
        <label
          className={`button secondary ${disabled || busy ? "disabled" : ""}`}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <FileText size={16} />
          )}{" "}
          {t("docs.upload")}
          <input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {error && <p className="tool-error">{error}</p>}
      {!items.length && !error && (
        <p className="tool-empty">{t("docs.empty")}</p>
      )}
      {!!items.length && (
        <ul className="tool-docs">
          {items.map((d) => (
            <li key={d.id}>
              <strong>{d.filename}</strong>
              <span className="tool-muted">
                {d.kind.toUpperCase()}
                {d.pages ? ` · ${d.pages} ${t("docs.pages")}` : ""} ·{" "}
                {when(d.created_at)}
              </span>
              {d.excerpt && <p>{d.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProfileTools({
  profileId,
  t,
  onOpen,
  disabled,
  refreshKey,
}: {
  profileId: string;
  t: T;
  onOpen: (id: string) => void;
  disabled: boolean;
  refreshKey: number;
}) {
  const [tab, setTab] = useState<"history" | "batch">("history");
  const [batchRefresh, setBatchRefresh] = useState(0);
  const tabs = [
    { id: "history", label: t("tools.history"), icon: History },
    { id: "batch", label: t("tools.batch"), icon: Images },
  ] as const;
  return (
    <section className="profile-tools" aria-label={t("tools.title")}>
      <div className="segmented tool-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {tab === "history" && (
        <HistoryTab
          profileId={profileId}
          t={t}
          onOpen={onOpen}
          disabled={disabled}
          refreshKey={refreshKey + batchRefresh}
        />
      )}
      {tab === "batch" && (
        <BatchTab
          profileId={profileId}
          t={t}
          onOpen={onOpen}
          disabled={disabled}
          onDone={() => setBatchRefresh((n) => n + 1)}
        />
      )}
    </section>
  );
}
