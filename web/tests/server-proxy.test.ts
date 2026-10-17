import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/backend/[...path]/route";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  vi.stubEnv("WORKSIGHT_MODE", "live");
  vi.stubEnv("WORKSIGHT_API_URL", "https://inspection.example");
  vi.stubEnv("WORKSIGHT_API_TOKEN", "test-server-only-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("forwards a profile mutation and keeps the server credential out of the response", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ id: "p" }, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  const request = new NextRequest(
    "https://worksight.example/api/backend/api/v1/profiles",
    {
      method: "POST",
      headers: {
        Origin: "https://worksight.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Bearing", description: "Top view" }),
    },
  );
  const response = await POST(request, context(["api", "v1", "profiles"]));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: "p" });
  expect(fetcher.mock.calls[0][0].href).toBe(
    "https://inspection.example/api/v1/profiles",
  );
  expect(fetcher.mock.calls[0][1].headers.get("authorization")).toBe(
    "Bearer test-server-only-token",
  );
  expect(response.headers.get("authorization")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects cross-origin writes before contacting FastAPI", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(
    new NextRequest("https://worksight.example/api/backend/api/v1/profiles", {
      method: "POST",
      headers: { Origin: "https://other.example" },
    }),
    context(["api", "v1", "profiles"]),
  );
  expect(response.status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not expose the live proxy in demo mode", async () => {
  vi.stubEnv("WORKSIGHT_MODE", "demo");
  const response = await GET(
    new NextRequest("https://worksight.example/api/backend/api/v1/profiles"),
    context(["api", "v1", "profiles"]),
  );
  expect(response.status).toBe(503);
});
it("converts a network failure into a service error without demo fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("network failure")),
  );
  const response = await GET(
    new NextRequest("https://worksight.example/api/backend/api/v1/profiles"),
    context(["api", "v1", "profiles"]),
  );
  expect(response.status).toBe(502);
  expect((await response.json()).error.code).toBe("service_unavailable");
});
it("sanitizes upstream stack traces", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { traceback: "secret infrastructure details" },
          { status: 500 },
        ),
      ),
  );
  const response = await GET(
    new NextRequest("https://worksight.example/api/backend/api/v1/profiles"),
    context(["api", "v1", "profiles"]),
  );
  expect(await response.text()).not.toContain("secret infrastructure");
  expect(response.status).toBe(500);
});
it("refuses active-content assets from the backend", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("<svg/>", {
        headers: { "Content-Type": "image/svg+xml" },
      }),
    ),
  );
  const response = await GET(
    new NextRequest(
      "https://worksight.example/api/backend/api/v1/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
    ),
    context(["api", "v1", "assets", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"]),
  );
  expect(response.status).toBe(502);
});
it("authenticates PNG assets through the server without leaking credentials", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const file = "b".repeat(64) + ".png";
  const response = await GET(
    new NextRequest(
      `https://worksight.example/api/backend/api/v1/assets/${file}`,
    ),
    context(["api", "v1", "assets", file]),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe(
    "Bearer test-server-only-token",
  );
  expect(response.headers.get("Authorization")).toBeNull();
});
it("preserves useful FastAPI validation errors without reflecting input or internal server details", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            detail: [
              {
                msg: "Provide at least 5 images per class",
                input: "private input",
              },
            ],
          },
          { status: 422 },
        ),
      ),
  );
  const response = await POST(
    new NextRequest(
      "https://worksight.example/api/backend/api/v1/profiles/p1/validation",
      { method: "POST" },
    ),
    context(["api", "v1", "profiles", "p1", "validation"]),
  );
  expect(response.status).toBe(422);
  const body = await response.json();
  expect(body.error.message).toBe("Provide at least 5 images per class");
  expect(JSON.stringify(body)).not.toContain("private input");
});
it("accepts the actual browser Host when standalone Next canonicalizes its internal URL", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        {
          job_id: "j",
          status: "queued",
          resource_id: "p",
          job_url: "/api/v1/jobs/j",
        },
        { status: 202 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const request = new NextRequest(
    "http://localhost:3101/api/backend/api/v1/profiles",
    {
      method: "POST",
      headers: { Host: "127.0.0.1:3101", Origin: "http://127.0.0.1:3101" },
    },
  );
  expect((await POST(request, context(["api", "v1", "profiles"]))).status).toBe(
    202,
  );
  expect(fetcher).toHaveBeenCalledOnce();
});
