import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assistiveReportSchema,
  backendJobSchema,
} from "../src/lib/backend-contract";
import { createBackendApi, mapJob } from "../src/lib/backend-api";
import { reportForInspection, waitForReport } from "../src/lib/reports";
import { DescriptionContent } from "../src/components/ai-description";
import { allowedRoute } from "../src/lib/proxy";
import { loadSavedExample } from "../src/lib/saved-example";

const base = {
  id: "r1",
  inspection_id: "i1",
  profile_id: "p1",
  created_at: "2026-10-18T01:00:00.123456+00:00",
  assistive_only: true,
  model_decision: "anomaly",
  inputs: ["original", "heatmap_overlay", "reference"],
  error: null,
};
const ready = assistiveReportSchema.parse({
  ...base,
  status: "ready",
  finished_at: "2026-10-18T01:01:00+00:00",
  summary: "A mark near the upper edge.",
  observations: ["Dark area next to the left pin."],
  suggested_check: "Inspect the pin under magnification.",
  heatmap_consistency: "partly_consistent",
  model: "Gemma-4-31B-IT",
  served_model: "self-dploy/Gemma-4-31B-IT",
  provider: "AMD Token Factory",
  latency_ms: 52029,
  usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
  finish_reason: "stop",
  failed_attempts: [],
});
const pending = assistiveReportSchema.parse({ ...base, status: "running" });
const failed = assistiveReportSchema.parse({
  ...base,
  status: "failed",
  error: "Report service rate limit reached; try again in a minute",
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("validates real queued, failed and ready records without requiring generated fields before completion", () => {
  expect(pending.status).toBe("running");
  expect(failed.status).toBe("failed");
  expect(ready).toMatchObject({
    provider: "AMD Token Factory",
    assistive_only: true,
  });
  expect(
    assistiveReportSchema.safeParse({ ...ready, assistive_only: false })
      .success,
  ).toBe(false);
  expect(
    assistiveReportSchema.safeParse({ ...ready, heatmap_consistency: "99%" })
      .success,
  ).toBe(false);
  expect(
    assistiveReportSchema.safeParse({
      ...ready,
      status: "ready",
      summary: undefined,
    }).success,
  ).toBe(false);
});
it("forwards health, latest, request and report routes using only the server proxy", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (url: string, init: RequestInit) => {
      if (url === "/api/backend/health")
        return Response.json({
          status: "ok",
          report: {
            enabled: true,
            provider: "AMD Token Factory",
            models: ["Gemma-4-31B-IT"],
          },
        });
      if (url.endsWith("/inspections/i1/report") && init.method === "POST")
        return Response.json(
          {
            job_id: "j1",
            status: "queued",
            resource_id: "r1",
            job_url: "/api/v1/jobs/j1",
          },
          { status: 202 },
        );
      return Response.json(ready);
    });
  vi.stubGlobal("fetch", fetcher);
  const api = createBackendApi();
  expect(await api.reports!.availability()).toEqual({ enabled: true });
  expect(await api.reports!.latest("i1")).toEqual(ready);
  expect(await api.reports!.request("i1")).toEqual({
    job_id: "j1",
    report_id: "r1",
  });
  expect(await api.reports!.get("r1")).toEqual(ready);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "/api/backend/health",
    "/api/backend/api/v1/inspections/i1/report",
    "/api/backend/api/v1/inspections/i1/report",
    "/api/backend/api/v1/reports/r1",
  ]);
  expect(
    fetcher.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(1);
  expect(fetcher.mock.calls.every(([, init]) => !init.headers)).toBe(true);
  const mapped = mapJob(
    backendJobSchema.parse({
      id: "j1",
      created_at: base.created_at,
      operation: "report",
      status: "succeeded",
      result: { report_id: "r1", inspection_id: "i1" },
      error: null,
    }),
  );
  expect(mapped.result).toEqual({ report_id: "r1", inspection_id: "i1" });
  expect(mapped.progress).toBeNull();
});
it("treats only 404 as no saved report, and exposes disabled providers without fabricating availability", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
  );
  expect(await createBackendApi().reports!.availability()).toEqual({
    enabled: false,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: "report not found" }, { status: 404 }),
      ),
  );
  expect(await createBackendApi().reports!.latest("i1")).toBeNull();
  for (const status of [401, 429, 503]) {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: "Report service unavailable" }, { status }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createBackendApi().reports!.request("i1"),
    ).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledOnce();
  }
});
it("never renders another inspection's report or a report that contradicts its immutable detector binding", async () => {
  expect(
    reportForInspection(ready, {
      id: "i1",
      profile_id: "p1",
      model_decision: "fail",
    }),
  ).toBe(ready);
  for (const inspection of [
    { id: "i2", profile_id: "p1", model_decision: "fail" as const },
    { id: "i1", profile_id: "p2", model_decision: "fail" as const },
    { id: "i1", profile_id: "p1", model_decision: "pass" as const },
  ])
    expect(() => reportForInspection(ready, inspection)).toThrow(
      "does not match",
    );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...ready, id: "r2" })),
  );
  await expect(createBackendApi().reports!.get("r1")).rejects.toMatchObject({
    code: "invalid_response",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...ready, inspection_id: "i2" })),
  );
  await expect(createBackendApi().reports!.latest("i1")).rejects.toMatchObject({
    code: "invalid_response",
  });
});
it("resumes an existing report with read-only polling, handles failure and stops at a deadline", async () => {
  const get = vi.fn().mockResolvedValueOnce(ready);
  const request = vi.fn();
  const api = { get, request } as never;
  const onUpdate = vi.fn();
  const signal = new AbortController().signal;
  expect(await waitForReport(api, pending, onUpdate, signal, 1)).toEqual(ready);
  expect(onUpdate).toHaveBeenCalledTimes(2);
  expect(request).not.toHaveBeenCalled();
  expect(await waitForReport(api, failed, onUpdate, signal, 1)).toEqual(failed);
  await expect(
    waitForReport(api, pending, onUpdate, signal, 1, -1),
  ).rejects.toMatchObject({ code: "report_timeout" });
  get.mockResolvedValue({ ...ready, id: "r2" });
  await expect(
    waitForReport(api, pending, onUpdate, signal, 1),
  ).rejects.toMatchObject({ code: "invalid_response" });
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    waitForReport(api, pending, onUpdate, aborted.signal, 1),
  ).rejects.toMatchObject({ name: "AbortError" });
});
it("renders escaped assistive text and actual model attribution without a second verdict", () => {
  if (ready.status !== "ready") throw new Error("fixture");
  const html = renderToStaticMarkup(
    createElement(DescriptionContent, {
      report: {
        ...ready,
        summary: '<script>alert("x")</script>',
        observations: [],
        suggested_check: null,
      },
    }),
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Gemma-4-31B-IT");
  expect(html).toContain("Runs on AMD Token Factory");
  expect(html).toContain("Partly consistent");
  expect(html).not.toContain("confidence %");
  expect(html).not.toContain("AMD GPU");
  expect(html).toContain("No visible observations were reported.");
});
it("opens only the intended report paths in the route allowlist", () => {
  expect(
    allowedRoute("GET", ["api", "v1", "inspections", "i1", "report"]),
  ).toBe(true);
  expect(
    allowedRoute("POST", ["api", "v1", "inspections", "i1", "report"]),
  ).toBe(true);
  expect(allowedRoute("GET", ["api", "v1", "reports", "r1"])).toBe(true);
  expect(allowedRoute("POST", ["api", "v1", "reports", "r1"])).toBe(false);
  expect(allowedRoute("GET", ["api", "v1", "reports", "r1", "secret"])).toBe(
    false,
  );
});

it("opens a saved example using only reads and propagates the abort signal", async () => {
  const inspection = { id: "i1", profile_id: "p1", model_decision: "fail" };
  const api = {
    inspection: vi.fn().mockResolvedValue(inspection),
    reports: { latest: vi.fn().mockResolvedValue(ready), request: vi.fn() },
  };
  const signal = new AbortController().signal;
  expect(await loadSavedExample(api as never, "i1", signal)).toEqual({
    inspection,
    report: ready,
  });
  expect(api.inspection).toHaveBeenCalledWith("i1", signal);
  expect(api.reports.latest).toHaveBeenCalledWith("i1", signal);
  expect(api.reports.request).not.toHaveBeenCalled();
});

it("rejects absent, unfinished, failed or mismatched saved examples", async () => {
  const inspection = { id: "i1", profile_id: "p1", model_decision: "fail" };
  const api = {
    inspection: vi.fn().mockResolvedValue(inspection),
    reports: { latest: vi.fn(), request: vi.fn() },
  };
  const signal = new AbortController().signal;
  for (const report of [null, pending, failed]) {
    api.reports.latest.mockResolvedValue(report);
    await expect(
      loadSavedExample(api as never, "i1", signal),
    ).rejects.toMatchObject({ code: "example_not_ready" });
  }
  api.reports.latest.mockResolvedValue({ ...ready, inspection_id: "i2" });
  await expect(
    loadSavedExample(api as never, "i1", signal),
  ).rejects.toMatchObject({ code: "invalid_response" });
  api.reports.latest.mockResolvedValue(ready);
  api.inspection.mockResolvedValue({ ...inspection, id: "i2" });
  await expect(
    loadSavedExample(api as never, "i1", signal),
  ).rejects.toMatchObject({ code: "invalid_response" });
  expect(api.reports.request).not.toHaveBeenCalled();
});

it("exposes saved-example service errors without retries or generation and stops aborted loads", async () => {
  const error = new Error("Service unavailable");
  const api = {
    inspection: vi.fn().mockRejectedValue(error),
    reports: { latest: vi.fn().mockResolvedValue(ready), request: vi.fn() },
  };
  await expect(
    loadSavedExample(api as never, "i1", new AbortController().signal),
  ).rejects.toBe(error);
  expect(api.inspection).toHaveBeenCalledOnce();
  expect(api.reports.request).not.toHaveBeenCalled();
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    loadSavedExample(api as never, "i1", aborted.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(api.inspection).toHaveBeenCalledOnce();
});
