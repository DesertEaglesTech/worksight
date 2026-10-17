import { describe, expect, it, vi, afterEach } from "vitest";
import {
  capabilitiesSchema,
  inspectionSchema,
  jobSchema,
} from "../src/lib/contract";
import { assetUrl, ApiError } from "../src/lib/api";
import { backendRequest as request } from "../src/lib/backend-api";
import { validateFiles } from "../src/lib/files";
import { allowedRoute, boundedBody, MAX_BODY } from "../src/lib/proxy";
import { waitForJob } from "../src/lib/jobs";
import { createDemoApi } from "../src/lib/demo";
afterEach(() => vi.unstubAllGlobals());
describe("operator safety and API boundary", () => {
  it("rejects invented or malformed result fields", () => {
    const base = {
      id: "i",
      profile_id: "p",
      profile_version: 1,
      original_url: "/v1/assets/a",
      heatmap_url: null,
      reference_url: null,
      model_decision: "review",
      processing_ms: null,
      created_at: new Date().toISOString(),
      feedback: null,
    };
    expect(inspectionSchema.parse(base).processing_ms).toBeNull();
    expect(
      inspectionSchema.safeParse({ ...base, model_decision: "probably_ok" })
        .success,
    ).toBe(false);
    expect(
      inspectionSchema.safeParse({ ...base, processing_ms: -4 }).success,
    ).toBe(false);
    expect(
      jobSchema.safeParse({
        id: "j",
        status: "running",
        stage: null,
        progress: 93,
        result: null,
        error: null,
      }).success,
    ).toBe(false);
  });
  it("accepts only allowed operations and safe asset URLs", () => {
    expect(allowedRoute("GET", ["api", "v1", "profiles"])).toBe(true);
    expect(
      allowedRoute("POST", ["api", "v1", "profiles", "part-1", "candidates"]),
    ).toBe(true);
    expect(
      allowedRoute("GET", ["api", "v1", "assets", "a".repeat(32) + ".png"]),
    ).toBe(true);
    for (const route of [
      ["v1", "..", "admin"],
      ["https:", "evil"],
      ["v1", "profiles", "a%2fb"],
      ["v1", "secrets"],
    ])
      expect(allowedRoute("GET", route)).toBe(false);
    expect(allowedRoute("DELETE", ["api", "v1", "profiles"])).toBe(false);
    expect(assetUrl("/api/v1/assets/" + "a".repeat(32) + ".png")).toBe(
      "/api/backend/api/v1/assets/" + "a".repeat(32) + ".png",
    );
    expect(assetUrl("javascript:alert(1)")).toBe("");
    expect(assetUrl("http://example.com/a.png")).toBe("");
  });
  it("rejects unsafe uploads before processing", () => {
    expect(
      validateFiles([new File(["x"], "a.svg", { type: "image/svg+xml" })]),
    ).toContain("unsupported");
    expect(
      validateFiles([new File([], "a.png", { type: "image/png" })]),
    ).toContain("empty");
    expect(
      validateFiles([new File(["x"], "a.png", { type: "image/png" })]),
    ).toBeNull();
    expect(
      validateFiles(
        Array.from(
          { length: 51 },
          () => new File(["x"], "a.png", { type: "image/png" }),
        ),
      ),
    ).toContain("50");
  });
  it("bounds chunked uploads even without Content-Length", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(MAX_BODY));
        c.enqueue(new Uint8Array(1));
        c.close();
      },
    });
    const req = new Request("http://localhost", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(boundedBody(req)).rejects.toThrow("payload_too_large");
  });
  it("reports service outages and schema changes instead of returning fixtures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(request("/capabilities", capabilitiesSchema)).rejects.toThrow(
      "could not be reached",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ surprise: true })),
    );
    await expect(
      request("/capabilities", capabilitiesSchema),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("terminates failed and cancelled jobs without inventing results", async () => {
    for (const status of ["failed", "cancelled"] as const) {
      const api = {
        job: vi
          .fn()
          .mockResolvedValue({
            id: "j",
            status,
            stage: null,
            progress: null,
            result: null,
            error: { code: "bad_image", message: "Image processing failed" },
          }),
      };
      await expect(
        waitForJob(api as never, "j", vi.fn(), new AbortController().signal, 1),
      ).rejects.toBeInstanceOf(ApiError);
      expect(api.job).toHaveBeenCalledTimes(1);
    }
  });
  it("stops polling after a deadline and honors aborts", async () => {
    const api = {
      job: vi
        .fn()
        .mockResolvedValue({
          id: "j",
          status: "running",
          stage: null,
          progress: null,
          result: null,
          error: null,
        }),
    };
    await expect(
      waitForJob(
        api as never,
        "j",
        vi.fn(),
        new AbortController().signal,
        1,
        -1,
      ),
    ).rejects.toMatchObject({ code: "job_timeout" });
    const c = new AbortController();
    c.abort();
    await expect(
      waitForJob(api as never, "j", vi.fn(), c.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps model and human decisions separate and demo sessions disposable", async () => {
    const api = createDemoApi();
    const job = await api.inspect("demo-bearing", new File(["x"], "part.png"));
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 3000);
    const result = await api.job(job);
    const id = result.result!.inspection_id!;
    const before = await api.inspection(id);
    const after = await api.feedback(id, "fail", "Visible gouge");
    expect(after.model_decision).toBe(before.model_decision);
    expect(after.feedback?.human_decision).toBe("fail");
    expect(after.processing_ms).toBeNull();
    vi.restoreAllMocks();
    await expect(createDemoApi().inspection(id)).rejects.toThrow("not found");
  });
});
