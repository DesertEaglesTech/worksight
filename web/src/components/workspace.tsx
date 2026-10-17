"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Layers3,
  ScanLine,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { assetUrl, liveApi } from "@/lib/api";
import type {
  Capabilities,
  Decision,
  Inspection,
  Job,
  Mode,
  Profile,
  ProfileVersion,
  VersionComparison,
} from "@/lib/contract";
import { createDemoApi } from "@/lib/demo";
import { waitForJob } from "@/lib/jobs";
import FileDrop from "./file-drop";
import InspectionViewer from "./inspection-viewer";

const decisionLabel: Record<Decision, string> = {
  pass: "Pass",
  fail: "Fail",
  review: "Needs review",
};
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const formatTimestamp = (date: string) =>
  new Date(date).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function DecisionTag({ value }: { value: Decision }) {
  return (
    <span className={`decision ${value}`}>
      {value === "pass" ? (
        <CheckCircle2 size={15} />
      ) : (
        <TriangleAlert size={15} />
      )}
      {decisionLabel[value]}
    </span>
  );
}
function Photo({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = assetUrl(src);
  return !failed && url ? (
    <img
      className={className}
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="image-missing">
      <TriangleAlert size={21} />
      <span>Image unavailable</span>
    </div>
  );
}

export default function Workspace({ mode }: { mode: Mode }) {
  const api = useMemo(
    () => (mode === "demo" ? createDemoApi() : liveApi),
    [mode],
  );
  const [profileQuery, setProfileQuery] = useState("");
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [screen, setScreen] = useState<"inspect" | "profiles">("inspect");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [samples, setSamples] = useState<File[]>([]);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [opacity, setOpacity] = useState(65);
  const [view, setView] = useState<"overlay" | "original" | "split">("overlay");
  const [humanDecision, setHumanDecision] = useState<Decision>("review");
  const [comment, setComment] = useState("");
  const [updatedVersion, setUpdatedVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<ProfileVersion[] | null>(null);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const menuWasOpen = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const selected = profiles.find((p) => p.id === selectedId);
  const visibleProfiles = profiles.filter((p) =>
    `${p.name} ${p.description}`
      .toLowerCase()
      .includes(profileQuery.trim().toLowerCase()),
  );
  const ready = profiles.filter((p) => p.status === "ready");
  const demo = mode === "demo";
  const unavailable = mode === "unconfigured";
  useEffect(() => {
    if (showCreate) dialog.current?.showModal();
    else dialog.current?.close();
  }, [showCreate]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!mobileMenuOpen) {
      if (menuWasOpen.current)
        document.getElementById("open-navigation")?.focus();
      menuWasOpen.current = false;
      return;
    }
    menuWasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.getElementById("close-navigation")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (unavailable) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [caps, items] = await Promise.all([
          api.capabilities(signal),
          api.profiles(signal),
        ]);
        if (signal?.aborted) return;
        setCapabilities(caps);
        setProfiles(items);
        setSelectedId((current) =>
          items.some((p) => p.id === current)
            ? current
            : (items.find((p) => p.status === "ready")?.id ??
              items[0]?.id ??
              ""),
        );
      } catch (e) {
        if (!signal?.aborted) setError(message(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, unavailable],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  async function refreshProfiles() {
    const items = await api.profiles();
    setProfiles(items);
    return items;
  }
  function chooseProfile(id: string) {
    setSelectedId(id);
    setInspection(null);
    setFiles([]);
    setSamples([]);
    setJob(null);
    setError("");
    setNotice("");
    setUpdatedVersion(null);
    setVersions(null);
    setComparison(null);
  }
  async function action(
    label: string,
    work: (signal: AbortSignal) => Promise<void>,
  ) {
    if (busy) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(label);
    setError("");
    setNotice("");
    setJob(null);
    try {
      await work(c.signal);
    } catch (e) {
      if (!c.signal.aborted) {
        setError(message(e));
        if (showCreate) setFormError(message(e));
      }
    } finally {
      if (!c.signal.aborted) setBusy("");
    }
  }
  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a profile name.");
      return;
    }
    await action("Creating profile", async () => {
      const p = await api.createProfile(name.trim(), description.trim());
      setProfiles((current) => [...current, p]);
      chooseProfile(p.id);
      setScreen("profiles");
      setProfileQuery("");
      setShowCreate(false);
      setName("");
      setDescription("");
      setFormError("");
      setNotice(
        "Profile created. Add known-good samples to prepare it for inspection.",
      );
    });
  }
  async function uploadSamples() {
    if (!selected || !samples.length) return;
    await action("Uploading samples", async () => {
      const p = await api.uploadSamples(selected.id, samples);
      setProfiles((current) =>
        current.map((item) => (item.id === p.id ? p : item)),
      );
      setSamples([]);
      setNotice(
        "Samples accepted. Build the profile when the reference set is ready.",
      );
    });
  }
  async function buildProfile(update = false) {
    if (!selected) return;
    const id = selected.id;
    await action(
      update ? "Updating profile" : "Building profile",
      async (signal) => {
        const jobId = await api.buildProfile(id);
        const done = await waitForJob(api, jobId, setJob, signal);
        if (done.result?.profile_id !== id)
          throw new Error("The service returned an unexpected profile result.");
        const items = await refreshProfiles();
        const p = items.find((p) => p.id === id);
        if (!p || p.status !== "ready")
          throw new Error(
            "The build completed, but the profile is not ready. Refresh to check its status.",
          );
        setUpdatedVersion(p.version);
        setVersions(null);
        setComparison(null);
        setNotice(
          `Profile v${p.version} is ready. Inspect the part again to see a new result.`,
        );
      },
    );
  }
  async function inspect() {
    if (!selected || !files[0]) return;
    await action("Inspecting image", async (signal) => {
      setInspection(null);
      setUpdatedVersion(null);
      const jobId = await api.inspect(selected.id, files[0]);
      const done = await waitForJob(api, jobId, setJob, signal);
      if (!done.result?.inspection_id)
        throw new Error("The service did not return an inspection ID.");
      const result = await api.inspection(done.result.inspection_id);
      setInspection(result);
      setHumanDecision(result.feedback?.human_decision ?? "review");
      setComment(result.feedback?.comment ?? "");
      setView("overlay");
    });
  }
  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!inspection) return;
    await action("Saving engineer review", async () => {
      const result = await api.feedback(
        inspection.id,
        humanDecision,
        comment.trim(),
      );
      setInspection(result);
      setNotice("Engineer review saved. The model decision remains unchanged.");
    });
  }
  async function loadFixture(kind: "sample" | "inspection") {
    await action("Loading example image", async () => {
      const response = await fetch(
        `/demo/${kind === "sample" ? "reference" : "defect"}.png`,
      );
      if (!response.ok) throw new Error("The example image is unavailable.");
      const file = new File(
        [await response.blob()],
        kind === "sample" ? "bearing-reference.png" : "bearing-gouge.png",
        { type: "image/png" },
      );
      if (kind === "sample") setSamples([file]);
      else {
        setFiles([file]);
        setInspection(null);
      }
    });
  }
  const canOperate = !!capabilities && !loading && !busy && !unavailable;

  return (
    <div
      className={`app-shell with-navigation ${menuCollapsed ? "navigation-collapsed" : ""} ${mobileMenuOpen ? "navigation-open" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="mobile-workspace-bar" inert={mobileMenuOpen}>
        <button
          className="icon-button"
          id="open-navigation"
          aria-label="Open navigation"
          aria-expanded={mobileMenuOpen}
          aria-controls="workspace-navigation"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu size={22} />
        </button>
        <span className="mobile-brand">worksight</span>
        <span>
          {screen === "inspect" ? "Part inspection" : "Reference samples"}
        </span>
      </header>
      {mobileMenuOpen && (
        <button
          className="navigation-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className="workspace-navigation"
        id="workspace-navigation"
        aria-label="Workspace navigation"
      >
        <div className="navigation-brand-row">
          <button
            className="brand"
            aria-label="Worksight home"
            disabled={!!busy}
            onClick={() => {
              setScreen("inspect");
              setMobileMenuOpen(false);
            }}
          >
            <span className="brand-mark" />
            <span className="navigation-wordmark">worksight</span>
          </button>
          <button
            id="close-navigation"
            className="icon-button mobile-navigation-close"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="navigation-section-label">Workspace</div>
        <nav aria-label="Main navigation">
          <button
            className={`workspace-nav-item ${screen === "inspect" ? "active" : ""}`}
            disabled={!!busy}
            aria-current={screen === "inspect" ? "page" : undefined}
            aria-label="Part inspection"
            title="Part inspection"
            onClick={() => {
              setScreen("inspect");
              setMobileMenuOpen(false);
            }}
          >
            <ScanLine size={21} aria-hidden="true" />
            <span className="navigation-label">Part inspection</span>
          </button>
          <button
            className={`workspace-nav-item ${screen === "profiles" ? "active" : ""}`}
            disabled={!!busy}
            aria-current={screen === "profiles" ? "page" : undefined}
            aria-label="Reference samples"
            title="Reference samples"
            onClick={() => {
              setScreen("profiles");
              setMobileMenuOpen(false);
            }}
          >
            <Layers3 size={21} aria-hidden="true" />
            <span className="navigation-label">Reference samples</span>
            <span className="navigation-profile-count">
              {capabilities ? profiles.length : "—"}
            </span>
          </button>
        </nav>
        <div className="navigation-profile">
          <span className="navigation-section-label">Selected profile</span>
          {selected ? (
            <button
              disabled={!!busy}
              onClick={() => {
                setScreen("profiles");
                setMobileMenuOpen(false);
              }}
              title="Manage selected profile"
            >
              <strong>{selected.name}</strong>
              <span>
                {selected.version ? `Version ${selected.version}` : "Not built"}{" "}
                · {selected.sample_count}{" "}
                {selected.sample_count === 1 ? "sample" : "samples"}
              </span>
              <span className={`status ${selected.status}`}>
                {selected.status.replaceAll("_", " ")}
              </span>
            </button>
          ) : (
            <p>No profile selected</p>
          )}
        </div>
        <div className="navigation-bottom">
          <p>Industrial visual inspection</p>
          <button
            className="navigation-toggle"
            aria-label={
              menuCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            title={menuCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!menuCollapsed}
            onClick={() => setMenuCollapsed(!menuCollapsed)}
          >
            {menuCollapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
            <span>Collapse menu</span>
          </button>
        </div>
      </aside>
      <main id="main" inert={mobileMenuOpen}>
        <div className="page-heading">
          <div>
            <h1>
              {screen === "inspect" ? "Part inspection" : "Reference samples"}
            </h1>
            <p>
              {screen === "inspect"
                ? "Select a reference profile, upload a part image and review the result."
                : "Manage the known-good images used to prepare each part profile."}
            </p>
          </div>
          <button
            className="button primary"
            disabled={!canOperate}
            onClick={() => {
              setFormError("");
              setShowCreate(true);
            }}
          >
            <Plus size={17} />
            New profile
          </button>
        </div>
        {unavailable && (
          <div className="alert error">
            <div>
              <strong>Service setup required</strong>
              <p>
                Configure the inspection service on the server, then restart the
                application.
              </p>
            </div>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <TriangleAlert size={20} />
            <div>
              <strong>Operation could not be completed</strong>
              <p>{error}</p>
              {!capabilities && !loading && (
                <button className="text-button" onClick={() => void load()}>
                  Retry connection
                </button>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <p>{notice}</p>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty loading-state" role="status">
            <LoaderCircle className="spin" size={28} />
            <h2>Loading workspace</h2>
            <p>Retrieving profiles and service capabilities.</p>
          </div>
        ) : !capabilities ? (
          <div className="empty loading-state">
            <TriangleAlert size={30} />
            <h2>
              {unavailable
                ? "Workspace setup required"
                : "The service is unavailable"}
            </h2>
            <p>
              {unavailable
                ? "Configure the workspace mode on the server to get started."
                : "Profiles could not be loaded. Reconnect to the service to continue."}
            </p>
            {!unavailable && (
              <button className="button secondary" onClick={() => void load()}>
                <RefreshCw size={16} />
                Reconnect
              </button>
            )}
          </div>
        ) : screen === "profiles" ? (
          <div className="profiles-layout">
            <section className="library" aria-label="Profile library">
              <div className="section-heading">
                <h2>
                  Profiles <span className="count">{profiles.length}</span>
                </h2>
                <button
                  className="icon-button"
                  aria-label="Refresh profiles"
                  disabled={!canOperate}
                  onClick={() => void load()}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <label className="sr-only" htmlFor="profile-search">
                Search profiles
              </label>
              <input
                id="profile-search"
                className="profile-search"
                type="search"
                placeholder="Search by name or description"
                value={profileQuery}
                onChange={(e) => setProfileQuery(e.target.value)}
              />
              <div className="library-summary">
                {ready.length} ready for inspection ·{" "}
                {profiles.length - ready.length} in preparation
              </div>
              {!profiles.length ? (
                <div className="empty">
                  <h3>No profiles yet</h3>
                  <p>
                    Create a profile for a part type and camera view, then add
                    known-good samples.
                  </p>
                  <button
                    className="button primary"
                    disabled={!canOperate}
                    onClick={() => setShowCreate(true)}
                  >
                    Create first profile
                  </button>
                </div>
              ) : visibleProfiles.length ? (
                <div className="profile-list">
                  {visibleProfiles.map((p) => (
                    <button
                      key={p.id}
                      disabled={!!busy}
                      onClick={() => chooseProfile(p.id)}
                      aria-pressed={p.id === selectedId}
                      className={`profile-item ${p.id === selectedId ? "selected" : ""}`}
                    >
                      <div className="profile-thumb">
                        {p.thumbnail_url ? (
                          <Photo src={p.thumbnail_url} alt="Reference part" />
                        ) : (
                          <span>No image</span>
                        )}
                      </div>
                      <div className="profile-item-info">
                        <strong>{p.name}</strong>
                        <span>
                          {p.sample_count}{" "}
                          {p.sample_count === 1 ? "sample" : "samples"} ·{" "}
                          {p.version ? `v${p.version}` : "Not built"}
                        </span>
                        <span className={`status ${p.status}`}>{p.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <h3>No matching profiles</h3>
                  <p>Try a different name or clear your search.</p>
                  <button
                    className="text-button"
                    onClick={() => setProfileQuery("")}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </section>
            <div className="profile-details">
              {selected ? (
                <>
                  <section className="profile-overview">
                    <div className="section-heading">
                      <div>
                        <span className="section-kicker">
                          Reference profile
                        </span>
                        <h2>{selected.name}</h2>
                      </div>
                      <span className={`status ${selected.status}`}>
                        {selected.status}
                      </span>
                    </div>
                    <p className="section-copy">
                      {selected.description || "No description added."}
                    </p>
                    <dl className="profile-facts">
                      <div>
                        <dt>Accepted samples</dt>
                        <dd>{selected.sample_count}</dd>
                      </div>
                      <div>
                        <dt>Active version</dt>
                        <dd>
                          {selected.version
                            ? `v${selected.version}`
                            : "Not built"}
                        </dd>
                      </div>
                      <div>
                        <dt>Last updated</dt>
                        <dd>{formatDate(selected.updated_at)}</dd>
                      </div>
                    </dl>
                    <div className="subsection-heading">
                      <h3>Known-good samples</h3>
                      <p>Use the same part type, camera view and framing.</p>
                    </div>
                    <FileDrop
                      files={samples}
                      onChange={setSamples}
                      multiple
                      disabled={!canOperate}
                      limits={capabilities.limits}
                      label="Upload known-good samples"
                    />
                    <div className="action-row">
                      {demo && (
                        <button
                          className="text-button"
                          disabled={!canOperate}
                          onClick={() => void loadFixture("sample")}
                        >
                          Use example sample
                        </button>
                      )}
                      <button
                        className="button secondary"
                        disabled={!canOperate || !samples.length}
                        onClick={() => void uploadSamples()}
                      >
                        Upload {samples.length || ""}{" "}
                        {samples.length === 1 ? "sample" : "samples"}
                      </button>
                    </div>
                    <div className="build-strip">
                      <div>
                        <h3>
                          {selected.version
                            ? "Build the next profile version"
                            : "Build the reference profile"}
                        </h3>
                        <p>
                          Prepare a version from accepted samples and supported
                          corrections.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        disabled={
                          !canOperate ||
                          !selected.sample_count ||
                          selected.status === "building"
                        }
                        onClick={() => void buildProfile()}
                      >
                        {selected.version
                          ? "Build next version"
                          : "Build profile"}
                      </button>
                    </div>
                    {selected.status === "ready" && (
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => setScreen("inspect")}
                      >
                        Inspect with this profile
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </section>
                  <section className="versions-section">
                    <div className="section-heading">
                      <h2>Profile versions</h2>
                      {!capabilities.features.version_history && (
                        <span className="planned">Planned</span>
                      )}
                    </div>
                    {!capabilities.features.version_history ? (
                      <p className="section-copy">
                        Version history, comparison and restore become available
                        when the backend supports them. The active version is
                        shown above.
                      </p>
                    ) : (
                      <>
                        <button
                          className="button secondary"
                          disabled={!canOperate}
                          onClick={() =>
                            void action("Loading version history", async () =>
                              setVersions(await api.versions(selected.id)),
                            )
                          }
                        >
                          Load version history
                        </button>
                        {versions && !versions.length && (
                          <p className="section-copy">
                            No version records are available.
                          </p>
                        )}
                        {versions?.map((v) => (
                          <div className="version-row" key={v.version}>
                            <div>
                              <strong>
                                v{v.version}
                                {v.active ? " · Active" : ""}
                              </strong>
                              <p>
                                {v.sample_count} samples ·{" "}
                                {formatDate(v.created_at)} · {v.source}
                              </p>
                            </div>
                            {!v.active && (
                              <div className="version-actions">
                                {capabilities.features.version_comparison && (
                                  <button
                                    className="text-button"
                                    disabled={!canOperate}
                                    onClick={() =>
                                      void action(
                                        "Comparing versions",
                                        async () =>
                                          setComparison(
                                            await api.compare(
                                              selected.id,
                                              v.version,
                                              selected.version,
                                            ),
                                          ),
                                      )
                                    }
                                  >
                                    Compare
                                  </button>
                                )}
                                {capabilities.features.rollback && (
                                  <button
                                    className="text-button"
                                    disabled={!canOperate}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Restore profile version ${v.version}? Existing inspection records retain their original version.`,
                                        )
                                      )
                                        void action(
                                          "Restoring version",
                                          async (signal) => {
                                            const id = await api.rollback(
                                              selected.id,
                                              v.version,
                                            );
                                            await waitForJob(
                                              api,
                                              id,
                                              setJob,
                                              signal,
                                            );
                                            await refreshProfiles();
                                            setVersions(
                                              await api.versions(selected.id),
                                            );
                                            setComparison(null);
                                            setNotice(
                                              "Profile version restored by the service.",
                                            );
                                          },
                                        );
                                    }}
                                  >
                                    Restore v{v.version}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {!capabilities.features.version_comparison && (
                          <p className="feature-note">
                            Version comparison{" "}
                            <span className="planned">Planned</span>
                          </p>
                        )}
                        {!capabilities.features.rollback && (
                          <p className="feature-note">
                            Version restore{" "}
                            <span className="planned">Planned</span>
                          </p>
                        )}
                        {comparison && (
                          <div className="comparison-result">
                            <h3>
                              v{comparison.from_version} compared with v
                              {comparison.to_version}
                            </h3>
                            <p>{comparison.summary}</p>
                            {comparison.metrics.length ? (
                              <table>
                                <thead>
                                  <tr>
                                    <th>Metric</th>
                                    <th>Before</th>
                                    <th>After</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {comparison.metrics.map((m) => (
                                    <tr key={m.name}>
                                      <td>{m.name}</td>
                                      <td>
                                        {m.before ?? "Not reported"} {m.unit}
                                      </td>
                                      <td>
                                        {m.after ?? "Not reported"} {m.unit}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p>
                                No evaluation metrics reported by the service.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                  <details className="profile-record">
                    <summary>Profile record</summary>
                    <dl className="detail-list">
                      <div>
                        <dt>Profile ID</dt>
                        <dd>{selected.id}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatTimestamp(selected.updated_at)}</dd>
                      </div>
                    </dl>
                  </details>
                </>
              ) : (
                <div className="empty">
                  <h2>Select a profile</h2>
                  <p>
                    Choose a profile to review and manage its reference samples.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <section
              className="inspection-controls"
              aria-label="Inspection setup"
            >
              <div className="profile-selector">
                <label htmlFor="profile">Reference profile</label>
                <div className="select-wrap">
                  <select
                    id="profile"
                    value={selectedId}
                    disabled={!canOperate || !profiles.length}
                    onChange={(e) => chooseProfile(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a profile
                    </option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.version ? `v${p.version}` : "Not built"}
                        {p.status !== "ready" ? ` · ${p.status}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <div className="setup-facts">
                <div>
                  <span>Status</span>
                  <strong
                    className={selected?.status === "ready" ? "ready-text" : ""}
                  >
                    {selected
                      ? selected.status === "ready"
                        ? "Ready for inspection"
                        : selected.status
                      : "No profile selected"}
                  </strong>
                </div>
                <div>
                  <span>References</span>
                  <strong>
                    {selected
                      ? `${selected.sample_count} ${selected.sample_count === 1 ? "sample" : "samples"}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Active version</span>
                  <strong>
                    {selected?.version ? `v${selected.version}` : "Not built"}
                  </strong>
                </div>
              </div>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => setScreen("profiles")}
              >
                Manage samples
                <ArrowRight size={16} />
              </button>
            </section>
            {!ready.length && (
              <div className="alert info">
                <p>
                  {profiles.length
                    ? "Prepare a profile before inspecting a part. Add known-good samples, then build the profile."
                    : "Create a reference profile and add known-good samples to start."}
                </p>
                <button
                  className="text-button"
                  onClick={() => setScreen("profiles")}
                >
                  Open reference samples
                </button>
              </div>
            )}
            <div className="inspection-layout">
              <section className="inspection-main" aria-label="Image workspace">
                <div className="viewer-toolbar">
                  <h2>{inspection ? "Inspection result" : "Part image"}</h2>
                  {inspection ? (
                    <div className="segmented" aria-label="Image view">
                      {(["original", "overlay", "split"] as const).map((v) => (
                        <button
                          key={v}
                          className={view === v ? "selected" : ""}
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                        >
                          {v === "overlay"
                            ? "Heatmap"
                            : v === "original"
                              ? "Original"
                              : "Compare"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="toolbar-note">
                      One image per inspection
                    </span>
                  )}
                </div>
                {inspection ? (
                  <>
                    <InspectionViewer
                      inspection={inspection}
                      view={view}
                      opacity={opacity}
                    />
                  </>
                ) : (
                  <div className="upload-stage">
                    <FileDrop
                      files={files}
                      onChange={(f) => {
                        setFiles(f);
                        setInspection(null);
                      }}
                      disabled={!canOperate || selected?.status !== "ready"}
                      limits={capabilities.limits}
                      label="Upload inspection image"
                      canvas
                    />
                    {demo && (
                      <button
                        className="text-button demo-sample"
                        disabled={!canOperate || selected?.status !== "ready"}
                        onClick={() => void loadFixture("inspection")}
                      >
                        Use example part image
                      </button>
                    )}
                    <p className="upload-guidance">
                      Match the camera angle, lighting and framing of your
                      reference samples.
                    </p>
                  </div>
                )}
                <div className="inspect-action">
                  <div>
                    <strong>{files[0]?.name ?? "No image selected"}</strong>
                    <small>
                      {inspection
                        ? `Result uses profile v${inspection.profile_version}`
                        : files[0]
                          ? `${formatBytes(files[0].size)} · ${files[0].type}`
                          : "Upload a JPEG, PNG or WebP image to begin."}
                    </small>
                  </div>
                  {inspection ? (
                    <button
                      className="button secondary"
                      disabled={!canOperate}
                      onClick={() => {
                        setInspection(null);
                        setJob(null);
                        setFiles([]);
                        setNotice("");
                      }}
                    >
                      New image
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={
                        !canOperate ||
                        selected?.status !== "ready" ||
                        !files.length
                      }
                      onClick={() => void inspect()}
                    >
                      Run inspection
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                {inspection && view !== "split" && (
                  <div className="reference-strip">
                    <div className="reference-small">
                      {inspection.reference_url ? (
                        <Photo
                          src={inspection.reference_url}
                          alt="Similar known-good reference sample"
                        />
                      ) : (
                        <span>No reference</span>
                      )}
                    </div>
                    <div>
                      <h3>Similar reference</h3>
                      <p>
                        {inspection.reference_url
                          ? `${selected?.name ?? "Known-good sample"} · profile v${inspection.profile_version}`
                          : "No similar reference returned by the service."}
                      </p>
                    </div>
                    {inspection.reference_url && (
                      <button
                        className="text-button"
                        onClick={() => setView("split")}
                      >
                        Compare images
                      </button>
                    )}
                  </div>
                )}
              </section>
              <aside className="result-sidebar" aria-label="Inspection review">
                <section className="sidebar-section decision-panel">
                  <div className="section-heading">
                    <h2>Model result</h2>
                    {inspection && (
                      <DecisionTag value={inspection.model_decision} />
                    )}
                  </div>
                  {inspection ? (
                    <>
                      <dl className="result-facts">
                        <div>
                          <dt>Profile version</dt>
                          <dd>v{inspection.profile_version}</dd>
                        </div>
                        <div>
                          <dt>Processing time</dt>
                          <dd>
                            {inspection.processing_ms === null
                              ? "Not reported"
                              : `${inspection.processing_ms.toLocaleString()} ms`}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <div className="awaiting">
                      <h3>Awaiting inspection</h3>
                      <p>
                        Upload an image and run inspection to see the service
                        result.
                      </p>
                    </div>
                  )}
                </section>
                <section className="sidebar-section display-panel">
                  <div className="section-heading">
                    <h2>Image display</h2>
                  </div>
                  <div className="opacity-controls">
                    <label htmlFor="opacity">Heatmap opacity</label>
                    <output htmlFor="opacity">{opacity}%</output>
                    <input
                      id="opacity"
                      type="range"
                      min="0"
                      max="100"
                      value={opacity}
                      disabled={!inspection?.heatmap_url || view === "original"}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                    />
                  </div>
                  <p className="small-note">
                    {view === "original"
                      ? "Select Heatmap or Compare to adjust the overlay."
                      : "Lower opacity to see the part surface under the heatmap."}
                  </p>
                </section>
                <section className="sidebar-section engineer-panel">
                  <div className="section-heading">
                    <h2>Engineer review</h2>
                    {inspection?.feedback && (
                      <span className="saved-tag">Saved</span>
                    )}
                  </div>
                  {inspection && capabilities.features.feedback ? (
                    <form onSubmit={(e) => void submitFeedback(e)}>
                      <p className="section-copy">
                        Confirm the part separately from the model result.
                      </p>
                      <label className="field-label" htmlFor="human-decision">
                        Human decision
                      </label>
                      <select
                        id="human-decision"
                        value={humanDecision}
                        disabled={!!busy}
                        onChange={(e) =>
                          setHumanDecision(e.target.value as Decision)
                        }
                      >
                        <option value="review">Needs review</option>
                        <option value="pass">Pass · acceptable part</option>
                        <option value="fail">Fail · defective part</option>
                      </select>
                      <label className="field-label" htmlFor="review-comment">
                        Engineer note <span>(optional)</span>
                      </label>
                      <textarea
                        id="review-comment"
                        placeholder="Describe the defect or explain your correction"
                        maxLength={2000}
                        rows={3}
                        value={comment}
                        disabled={!!busy}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <button
                        className="button primary full"
                        type="submit"
                        disabled={!canOperate}
                      >
                        {inspection.feedback
                          ? "Update review"
                          : "Save engineer review"}
                      </button>
                      {inspection.feedback && (
                        <div className="recorded-review">
                          <span>Recorded human decision</span>
                          <DecisionTag
                            value={inspection.feedback.human_decision}
                          />
                          <p>
                            {inspection.feedback.comment || "No note added."}
                          </p>
                          <small>
                            Saved{" "}
                            {formatTimestamp(inspection.feedback.created_at)}
                          </small>
                        </div>
                      )}
                    </form>
                  ) : (
                    <div className="awaiting">
                      <p>
                        {inspection
                          ? "Engineer feedback is not supported by the current service."
                          : "Review controls become available after inspection."}
                      </p>
                      {inspection && <span className="planned">Planned</span>}
                    </div>
                  )}
                </section>
                {inspection?.feedback && (
                  <section className="sidebar-section update-panel">
                    <div className="section-heading">
                      <h2>Profile update</h2>
                    </div>
                    <p className="section-copy">
                      Request a new version using the supported correction
                      workflow.
                    </p>
                    {capabilities.features.profile_updates ? (
                      <button
                        className="button secondary full"
                        disabled={
                          !canOperate || selected?.status === "building"
                        }
                        onClick={() => void buildProfile(true)}
                      >
                        Update profile
                      </button>
                    ) : (
                      <span className="planned">Planned</span>
                    )}
                    {updatedVersion !== null && (
                      <div className="update-result">
                        <strong>v{updatedVersion} is ready</strong>
                        <p>Inspect again with the new version.</p>
                      </div>
                    )}
                  </section>
                )}
                <details className="sidebar-section inspection-details" open>
                  <summary>Inspection details</summary>
                  <dl className="detail-list">
                    <div>
                      <dt>Profile</dt>
                      <dd>{selected?.name ?? "Not selected"}</dd>
                    </div>
                    {selected?.description && (
                      <div>
                        <dt>Description</dt>
                        <dd>{selected.description}</dd>
                      </div>
                    )}
                    <div>
                      <dt>File</dt>
                      <dd>{files[0]?.name ?? "Not uploaded"}</dd>
                    </div>
                    {files[0] && (
                      <div>
                        <dt>File size</dt>
                        <dd>{formatBytes(files[0].size)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Inspection ID</dt>
                      <dd>{inspection?.id ?? "Not created"}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>
                        {inspection
                          ? formatTimestamp(inspection.created_at)
                          : "Not created"}
                      </dd>
                    </div>
                  </dl>
                </details>
              </aside>
            </div>
          </>
        )}
        {busy && (
          <div className="job-status" role="status" aria-live="polite">
            <LoaderCircle size={20} className="spin" />
            <div>
              <strong>{busy}</strong>
              <span>{job?.stage || "Waiting for the service response…"}</span>
              {job && (
                <small>
                  Job {job.id} · {job.status}
                </small>
              )}
              {job?.progress != null && (
                <progress
                  max={1}
                  value={job.progress}
                  aria-label="Processing progress"
                />
              )}
            </div>
          </div>
        )}
        <footer className="workspace-footer">
          <span>Worksight · Visual inspection</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className="create-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setShowCreate(false);
        }}
        onClose={() => setShowCreate(false)}
      >
        <form onSubmit={(e) => void createProfile(e)}>
          <div className="dialog-heading">
            <h2>Create a profile</h2>
            <button
              type="button"
              className="icon-button"
              disabled={!!busy}
              aria-label="Close profile dialog"
              onClick={() => setShowCreate(false)}
            >
              <X size={21} />
            </button>
          </div>
          <p>Use a separate profile for each part type and camera view.</p>
          <label className="field-label" htmlFor="profile-name">
            Profile name
          </label>
          <input
            autoFocus
            id="profile-name"
            required
            maxLength={100}
            placeholder="e.g. Bearing housing · top view"
            value={name}
            disabled={!!busy}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="field-label" htmlFor="profile-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="profile-description"
            rows={3}
            maxLength={1000}
            placeholder="Part type, camera view or inspection criteria"
            value={description}
            disabled={!!busy}
            onChange={(e) => setDescription(e.target.value)}
          />
          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={!!busy}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={!!busy}>
              {busy && <LoaderCircle size={16} className="spin" />}Create
              profile
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
