import { NextRequest } from "next/server";
import { allowedRoute, boundedBody, MAX_BODY } from "@/lib/proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (process.env.WORKSIGHT_MODE !== "live") return fail(503, "live_disabled", "The live service is not configured.");
  const { path } = await context.params;
  if (!allowedRoute(request.method, path)) return fail(404, "not_found", "This API route is not available.");
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== request.nextUrl.origin) return fail(403, "invalid_origin", "This request is not allowed.");
  const base = process.env.WORKSIGHT_API_URL;
  if (!base) return fail(503, "not_configured", "The inspection service has not been configured.");
  if (Number(request.headers.get("content-length")) > MAX_BODY) return fail(413, "payload_too_large", "The combined upload is too large.");
  let body: Uint8Array | undefined;
  try { body = request.method === "POST" ? await boundedBody(request) : undefined; }
  catch { return fail(413, "payload_too_large", "The combined upload is too large."); }
  try {
    const url = new URL(`${base.replace(/\/$/, "")}/${path.join("/")}`);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_base");
    if (path.at(-1) === "compare") { for (const key of ["from", "to"]) { const value = request.nextUrl.searchParams.get(key); if (!value || !/^\d+$/.test(value)) return fail(400, "invalid_version", "Choose valid profile versions."); url.searchParams.set(key, value); } }
    const headers = new Headers();
    if (request.headers.get("content-type")) headers.set("Content-Type", request.headers.get("content-type")!);
    if (process.env.WORKSIGHT_API_TOKEN) headers.set("Authorization", `Bearer ${process.env.WORKSIGHT_API_TOKEN}`);
    const upstream = await fetch(url, { method: request.method, headers, body: body as BodyInit | undefined, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]) });
    if (path[1] === "assets") {
      const mime = upstream.headers.get("content-type")?.split(";")[0];
      if (!upstream.ok) return fail(upstream.status, "asset_unavailable", "The inspection image is unavailable.");
      if (!mime || !["image/png", "image/jpeg", "image/webp"].includes(mime)) return fail(502, "invalid_asset", "The service returned an unsupported image format.");
      return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // Do not expose upstream stack traces, credentials, HTML or arbitrary error payloads.
      const messages: Record<number, string> = { 400: "The service could not accept this request.", 401: "The service credentials need to be checked by the administrator.", 403: "The service denied this operation.", 404: "This record is no longer available.", 409: "The profile changed or is not ready. Refresh and try again.", 413: "The upload exceeds the service limit.", 415: "The service does not support this file type.", 422: "The service could not process these images. Check the files and retry.", 429: "The service is busy. Please try again shortly." };
      return fail(upstream.status, "backend_error", messages[upstream.status] ?? "The inspection service encountered an error. Try again later.");
    }
    return Response.json(data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch { return fail(502, "service_unavailable", "The inspection service is unavailable. Check the connection and try again."); }
}
export const GET = proxy;
export const POST = proxy;
