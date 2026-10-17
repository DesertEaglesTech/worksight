import { afterEach, expect, it, vi } from "vitest";
import {
  backendProfileSchema,
  backendVersionSchema,
  backendInspectionSchema,
  backendFeedbackSchema,
  backendJobSchema,
} from "../src/lib/backend-contract";
import {
  backendRequest,
  backendErrorMessage,
  createBackendApi,
  mapProfile,
  mapVersions,
  mapInspection,
  mapJob,
  feedbackLabel,
  backendLimits,
} from "../src/lib/backend-api";
import {
  allowedRoute,
  forwardedQuery,
  idempotencyKey,
  upstreamError,
} from "../src/lib/proxy";
import { assetUrl } from "../src/lib/api";
const date = "2026-10-18T01:00:00.123456+00:00";
const asset = `${"a".repeat(64)}.png`;
const image = { asset, sha256: "a".repeat(64), width: 640, height: 480 };
const runtime = {
  device: "cpu",
  device_name: "arm",
  amd_gpu: false,
  torch_version: "2.14.1",
  torchvision_version: "0.29.1",
  hip_version: null,
  encoder: "resnet18",
};
const profile = backendProfileSchema.parse({
  id: "p1",
  name: "PCB",
  created_at: date,
  status: "ready",
  active_version_id: "v1",
  validation_id: null,
  error: null,
});
const version = backendVersionSchema.parse({
  id: "v1",
  profile_id: "p1",
  created_at: date,
  parent_version_id: null,
  state: "approved",
  reference_count: 10,
  references: Array.from({ length: 10 }, (_, i) => ({
    ...image,
    asset: `${i.toString(16).padStart(64, "0")}.png`,
    sha256: i.toString(16).padStart(64, "0"),
  })),
  threshold: { value: 0.2, status: "heuristic_not_probability" },
  feedback_ids: [],
  evaluation_id: null,
});
const rawInspection = {
  id: "i1",
  profile_id: "p1",
  version_id: "v1",
  status: "ready",
  created_at: date,
  finished_at: date,
  image_url: `/api/v1/assets/${asset}`,
  heatmap_url: `/api/v1/assets/${"b".repeat(32)}.png`,
  overlay_url: `/api/v1/assets/${"c".repeat(32)}.png`,
  reference_url: `/api/v1/assets/${asset}`,
  anomaly_score: 0.31,
  threshold: 0.2,
  threshold_status: "heuristic_not_probability",
  decision: "anomaly",
  inference_ms: 12.3,
  runtime,
  matches_reference_image: false,
};
const feedback = backendFeedbackSchema.parse({
  id: "f1",
  inspection_id: "i1",
  profile_id: "p1",
  version_id: "v1",
  image,
  label: "normal",
  note: "Confirmed",
  created_at: date,
});
afterEach(() => vi.unstubAllGlobals());
it("maps offset timestamps, active opaque versions and actual profile references", () => {
  const second = {
    ...version,
    id: "v2",
    created_at: "2026-10-18T02:00:00+00:00",
    parent_version_id: "v1",
    reference_count: 11,
  };
  expect(
    mapVersions(profile, [second, version]).map((v) => [
      v.id,
      v.version,
      v.active,
    ]),
  ).toEqual([
    ["v1", 1, true],
    ["v2", 2, false],
  ]);
  expect(mapProfile(profile, [version, second])).toMatchObject({
    id: "p1",
    version: 1,
    sample_count: 10,
    description: "",
    thumbnail_url: `/api/v1/assets/${"0".repeat(64)}.png`,
  });
  expect(
    mapProfile({ ...profile, active_version_id: null, status: "running" }, []),
  ).toMatchObject({ status: "building", version: 0, sample_count: 0 });
  expect(mapProfile({ ...profile, status: "failed" }, [version]).status).toBe(
    "failed",
  );
  expect(() => mapProfile(profile, [])).toThrow("missing");
});
it("maps real inference fields, every decision, and separately loaded immutable feedback", () => {
  for (const [decision, mapped] of [
    ["normal", "pass"],
    ["anomaly", "fail"],
    ["review", "review"],
  ]) {
    const result = mapInspection(
      backendInspectionSchema.parse({ ...rawInspection, decision }),
      mapVersions(profile, [version]),
      [feedback],
    );
    expect(result).toMatchObject({
      model_decision: mapped,
      processing_ms: 12.3,
      profile_version: 1,
      anomaly_score: 0.31,
      threshold: 0.2,
      runtime: { device: "cpu", amd_gpu: false },
      feedback: { human_decision: "pass", comment: "Confirmed" },
    });
  }
  expect(feedbackLabel).toEqual({
    pass: "normal",
    fail: "anomaly",
    review: "unsure",
  });
  expect(() =>
    mapInspection(backendInspectionSchema.parse(rawInspection), [], []),
  ).toThrow("version is missing");
});
it("maps backend jobs without fictional progress, and preserves version/evaluation IDs", () => {
  const job = backendJobSchema.parse({
    id: "j",
    operation: "create_candidate",
    status: "succeeded",
    result: { profile_id: "p1", version_id: "v2", state: "candidate" },
    error: null,
    created_at: date,
  });
  expect(mapJob(job)).toMatchObject({
    stage: "create_candidate",
    progress: null,
    result: { version_id: "v2" },
    error: null,
  });
  expect(
    mapJob({ ...job, status: "failed", result: null, error: "Encoder failed" })
      .error,
  ).toEqual({ code: "processing_failed", message: "Encoder failed" });
});
it("handles FastAPI detail strings, arrays, service outages and invalid responses", async () => {
  expect(
    backendErrorMessage(422, { detail: [{ msg: "Field required" }] }),
  ).toBe("Field required");
  expect(backendErrorMessage(409, { detail: "Frozen" })).toBe("Frozen");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(
    backendRequest("/profiles", backendProfileSchema),
  ).rejects.toMatchObject({ code: "service_unavailable" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ surprise: true })),
  );
  await expect(
    backendRequest("/profiles", backendProfileSchema),
  ).rejects.toMatchObject({ code: "invalid_response" });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: "conflicting" }, { status: 409 }),
      ),
  );
  await expect(
    createBackendApi().feedback("i1", "fail", "defect"),
  ).rejects.toMatchObject({
    code: "feedback_conflict",
    status: 409,
    message: expect.stringContaining("different engineer decision"),
  });
});
it("stages drafts only in memory and submits one multipart create operation", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json(
      {
        job_id: "j1",
        status: "queued",
        resource_id: "p1",
        job_url: "/api/v1/jobs/j1",
      },
      { status: 202 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 100;
      naturalHeight = 100;
      onload?: () => void;
      set src(_value: string) {
        this.onload?.();
      }
    },
  );
  const api = createBackendApi();
  const draft = await api.createProfile("PCB", "not persisted");
  expect(fetcher).not.toHaveBeenCalled();
  expect(draft).toMatchObject({ description: "", local_draft: true });
  await expect(api.buildProfile(draft.id)).rejects.toThrow("at least 3");
  const files = [1, 2, 3].map(
    (n) => new File([String(n)], `${n}.png`, { type: "image/png" }),
  );
  await api.uploadSamples(draft.id, files);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await api.buildProfile(draft.id)).toBe("j1");
  expect(fetcher.mock.calls[0][0]).toBe("/api/backend/api/v1/profiles");
  const form = fetcher.mock.calls[0][1].body as FormData;
  expect(form.get("name")).toBe("PCB");
  expect(form.getAll("images")).toHaveLength(3);
  expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  await expect(
    createBackendApi().uploadSamples(draft.id, files),
  ).rejects.toThrow("new draft");
});
it("allows only real routes and strict authenticated PNG asset paths", () => {
  const routes = [
    ["GET", "api/v1/profiles"],
    ["GET", "api/v1/profiles/p1"],
    ["GET", "api/v1/profiles/p1/feedback"],
    ["POST", "api/v1/profiles/p1/inspections"],
    ["POST", "api/v1/profiles/p1/validation"],
    ["POST", "api/v1/profiles/p1/candidates"],
    ["POST", "api/v1/profiles/p1/versions/v2/evaluate"],
    ["POST", "api/v1/profiles/p1/versions/v2/activate"],
    ["GET", "api/v1/evaluations/e1"],
    ["POST", "api/v1/profiles/p1/batches"],
    ["GET", "api/v1/profiles/p1/batches"],
    ["GET", "api/v1/batches/b1"],
    ["POST", "api/v1/profiles/p1/documents"],
    ["GET", "api/v1/profiles/p1/documents"],
    ["GET", "api/v1/profiles/p1/stats"],
    ["GET", "api/v1/profiles/p1/validation"],
    ["GET", "api/v1/profiles/p1/activations"],
    ["POST", "api/v1/inspections/i1/report"],
    ["GET", "api/v1/inspections/i1/report"],
    ["GET", "api/v1/reports/r1"],
  ];
  for (const [method, path] of routes)
    expect(allowedRoute(method, path.split("/"))).toBe(true);
  for (const path of [
    "v1/profiles",
    "api/v1/capabilities",
    "api/v1/profiles/p1/build",
    "api/v1/assets/a.png",
    `api/v1/assets/${"a".repeat(32)}.svg`,
    "api/v1/../health",
    "api/v1/profiles/a%2fb",
  ])
    expect(allowedRoute("GET", path.split("/"))).toBe(false);
  for (const size of [32, 64]) {
    const path = `/api/v1/assets/${"a".repeat(size)}.png`;
    expect(assetUrl(path)).toBe(`/api/backend${path}`);
    expect(allowedRoute("GET", path.slice(1).split("/"))).toBe(true);
  }
  expect(assetUrl("/api/v1/assets/a.png")).toBe("");
  expect(assetUrl(`/api/v1/assets/${"A".repeat(32)}.png`)).toBe("");
  expect(backendLimits).toMatchObject({
    max_file_bytes: 10485760,
    max_files: 200,
    max_image_pixels: 16000000,
  });
  expect(upstreamError(422, { detail: [{ msg: "Invalid image" }] })).toBe(
    "Invalid image",
  );
  expect(upstreamError(500, { detail: "secret stack trace" })).not.toContain(
    "secret",
  );
  expect(upstreamError(409, { detail: "key=secret" }, "secret")).not.toContain(
    "secret",
  );
});
it("uses the real inspection, feedback, validation, candidate, evaluation and activation shapes", async () => {
  const metric = {
    count: 10,
    normal_count: 5,
    anomaly_count: 5,
    auroc: 0.9,
    f1: 0.8,
    false_positive_rate: 0,
    recall: 0.8,
    true_positive: 4,
    false_negative: 1,
    false_positive: 0,
    true_negative: 5,
    threshold: 0.2,
    decision_rule:
      "score >= threshold; review band excluded from binary benchmark",
  };
  const report = {
    id: "e1",
    profile_id: "p1",
    version_id: "v2",
    baseline_version_id: "v1",
    validation_id: "validation1",
    created_at: date,
    baseline: metric,
    candidate: metric,
    gate: {
      passed: true,
      improved: false,
      rule: "no additional false positives or false negatives on the same validation set",
    },
    runtime,
    purpose: "validation_for_version_selection_not_final_test",
    samples: [],
  };
  const accepted = {
    job_id: "j1",
    status: "queued",
    resource_id: null,
    job_url: "/api/v1/jobs/j1",
  };
  const fetcher = vi
    .fn()
    .mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/inspections") && init.method === "POST")
        return Response.json(accepted, { status: 202 });
      if (url.endsWith("/feedback") && init.method === "POST")
        return Response.json(feedback);
      if (url.endsWith("/feedback"))
        return Response.json({ items: [feedback] });
      if (url.endsWith("/inspections/i1")) return Response.json(rawInspection);
      if (url.endsWith("/profiles/p1/versions"))
        return Response.json({
          items: [
            version,
            {
              ...version,
              id: "v2",
              created_at: "2026-10-18T02:00:00+00:00",
              parent_version_id: "v1",
              state: "candidate",
              evaluation_id: "e1",
            },
          ],
        });
      if (url.endsWith("/profiles/p1")) return Response.json(profile);
      if (url.endsWith("/validation"))
        return Response.json({
          id: "validation1",
          profile_id: "p1",
          created_at: date,
          baseline_version_id: "v1",
          samples: [],
        });
      if (url.endsWith("/candidates") || url.endsWith("/evaluate"))
        return Response.json(accepted, { status: 202 });
      if (url.endsWith("/evaluations/e1")) return Response.json(report);
      if (url.endsWith("/activate")) return Response.json(profile);
      throw new Error(`Unexpected request ${url}`);
    });
  vi.stubGlobal("fetch", fetcher);
  const api = createBackendApi();
  const file = new File(["image"], "part.png", { type: "image/png" });
  expect(await api.inspect("p1", file)).toBe("j1");
  expect(fetcher.mock.calls[0][0]).toBe(
    "/api/backend/api/v1/profiles/p1/inspections",
  );
  expect(
    (fetcher.mock.calls[0][1].body as FormData).get("image"),
  ).toBeInstanceOf(File);
  expect(await api.feedback("i1", "pass", "Confirmed")).toMatchObject({
    model_decision: "fail",
    feedback: { human_decision: "pass" },
  });
  const reviewCall = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith("/feedback") && init.method === "POST",
  )!;
  expect(JSON.parse(reviewCall[1].body)).toEqual({
    label: "normal",
    note: "Confirmed",
  });
  await expect(
    api.workflow!.freezeValidation("p1", [file], [file]),
  ).rejects.toThrow("at least 5");
  await api.workflow!.freezeValidation(
    "p1",
    Array(5).fill(file),
    Array(5).fill(file),
  );
  const validationCall = fetcher.mock.calls.find(([url]) =>
    url.endsWith("/validation"),
  )!;
  expect(validationCall[1].body.getAll("normal")).toHaveLength(5);
  expect(validationCall[1].body.getAll("anomaly")).toHaveLength(5);
  expect(await api.workflow!.createCandidate("p1", ["f1"])).toBe("j1");
  expect(
    JSON.parse(
      fetcher.mock.calls.find(([url]) => url.endsWith("/candidates"))![1].body,
    ),
  ).toEqual({ feedback_ids: ["f1"] });
  expect(await api.workflow!.evaluateCandidate("p1", "v2")).toBe("j1");
  expect(await api.workflow!.evaluation("e1")).toMatchObject({
    gate: { passed: true, improved: false },
    baseline: metric,
    candidate: metric,
  });
  expect(await api.compare("p1", 1, 2)).toMatchObject({
    from_version: 1,
    to_version: 2,
    summary: "No regression measured on the frozen validation set.",
    metrics: expect.arrayContaining([
      { name: "f1", before: 0.8, after: 0.8, unit: "" },
    ]),
  });
  await expect(api.rollback("p1", 2)).rejects.toThrow("approved");
  await expect(api.rollback("p1", 1)).resolves.toBeUndefined();
  await api.workflow!.activateVersion("p1", "v1");
  expect(fetcher.mock.calls.at(-1)![0]).toBe(
    "/api/backend/api/v1/profiles/p1/versions/v1/activate",
  );
});
it("loads persisted profiles and reviews from the backend, never from another adapter instance", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (url: string) =>
        Response.json(
          url.endsWith("/versions")
            ? { items: [version] }
            : { items: [profile] },
        ),
      ),
  );
  const first = createBackendApi();
  const draft = await first.createProfile("Unsent", "");
  expect((await first.profiles()).map((p) => p.id)).toContain(draft.id);
  expect((await createBackendApi().profiles()).map((p) => p.id)).toEqual([
    "p1",
  ]);
});
it("rejects images larger than the actual 16 MP backend limit before staging", async () => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 5000;
      naturalHeight = 4000;
      onload?: () => void;
      set src(_value: string) {
        this.onload?.();
      }
    },
  );
  const api = createBackendApi();
  const draft = await api.createProfile("PCB", "");
  await expect(
    api.uploadSamples(draft.id, [
      new File(["image"], "oversized.png", { type: "image/png" }),
    ]),
  ).rejects.toThrow("16 megapixel limit");
});
it("numbers versions by backend microsecond timestamps instead of opaque ID order", () => {
  const first = {
    ...version,
    id: "z-first",
    created_at: "2026-10-18T01:00:00.123001+00:00",
  };
  const second = {
    ...version,
    id: "a-second",
    created_at: "2026-10-18T01:00:00.123002+00:00",
  };
  expect(
    mapVersions({ ...profile, active_version_id: "a-second" }, [
      second,
      first,
    ]).map((v) => [v.id, v.version]),
  ).toEqual([
    ["z-first", 1],
    ["a-second", 2],
  ]);
});

it("forwards only known query parameters and safe idempotency keys", () => {
  const history = ["api", "v1", "profiles", "p1", "inspections"];
  const query = new URLSearchParams(
    "limit=20&cursor=abc_-=&decision=anomaly&human=none&since=2026-10-18T00:00:00Z&evil=1&decision2=x",
  );
  expect(Object.fromEntries(forwardedQuery("GET", history, query))).toEqual({
    limit: "20",
    cursor: "abc_-=",
    decision: "anomaly",
    human: "none",
    since: "2026-10-18T00:00:00Z",
  });
  expect(
    forwardedQuery(
      "GET",
      history,
      new URLSearchParams("limit=abc&human=all"),
    ).toString(),
  ).toBe("");
  const report = ["api", "v1", "inspections", "i1", "report"];
  expect(
    forwardedQuery(
      "POST",
      report,
      new URLSearchParams("refresh=true&limit=5"),
    ).toString(),
  ).toBe("refresh=true");
  expect(
    forwardedQuery("GET", ["api", "v1", "profiles"], query).toString(),
  ).toBe("");
  expect(idempotencyKey("report-abc_1")).toBe("report-abc_1");
  for (const bad of [null, "", "has space", "x".repeat(201), "line\nbreak"])
    expect(idempotencyKey(bad)).toBeNull();
});
it("shows the backend reason for a rate-limited AI description", () => {
  expect(
    upstreamError(429, {
      detail: "AI description limit reached for this demo; try again later",
    }),
  ).toBe("AI description limit reached for this demo; try again later");
  expect(upstreamError(429, null)).toBe(
    "The service is busy. Please try again shortly.",
  );
  expect(upstreamError(429, { detail: "<html>" })).toBe(
    "The inspection service encountered an error. Try again later.",
  );
});
