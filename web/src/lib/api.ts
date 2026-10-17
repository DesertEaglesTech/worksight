export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "request_failed",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
/** Only proxy known relative asset paths. Signed HTTPS URLs may be supplied by the backend. */
export function assetUrl(value: string): string {
  if (/^\/api\/v1\/assets\/(?:[0-9a-f]{32}|[0-9a-f]{64})\.png$/.test(value))
    return `/api/backend${value}`;
  if (value.startsWith("/demo/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.href;
  } catch {
    /* reject */
  }
  return "";
}
