/** Explicit FastAPI routes only; never proxy arbitrary URLs or path segments. */
export function allowedRoute(method: string, segments: string[]): boolean {
  if (
    segments.some((s) => !/^[a-zA-Z0-9_-]+$/.test(s)) &&
    !(
      segments.length === 4 &&
      segments.slice(0, 3).join("/") === "api/v1/assets"
    )
  )
    return false;
  const path = segments.join("/");
  const record = "[a-zA-Z0-9_-]+";
  const get = new RegExp(
    `^api/v1/(profiles|profiles/${record}(/(versions|inspections|feedback|batches|documents|stats|validation|activations))?|jobs/${record}|inspections/${record}(/report)?|evaluations/${record}|batches/${record}|reports/${record}|assets/(?:[0-9a-f]{32}|[0-9a-f]{64})\\.png)$`,
  );
  const post = new RegExp(
    `^api/v1/(runtime/warmup|profiles|profiles/${record}/(inspections|validation|candidates|batches|documents)|profiles/${record}/versions/${record}/(evaluate|activate)|inspections/${record}/(feedback|report))$`,
  );
  return method === "GET"
    ? path === "health" || get.test(path)
    : method === "POST" && post.test(path);
}
/** Only known query parameters with validated values reach FastAPI. */
const queryRules: Record<string, RegExp> = {
  limit: /^\d{1,3}$/,
  cursor: /^[A-Za-z0-9_=-]{1,512}$/,
  since: /^[0-9T:.+Z-]{10,40}$/,
  until: /^[0-9T:.+Z-]{10,40}$/,
  decision: /^(normal|anomaly|review)$/,
  human: /^(none|any|normal|anomaly|unsure)$/,
  refresh: /^(true|false)$/,
};
const queryRoutes: [string, RegExp, string[]][] = [
  [
    "GET",
    /^api\/v1\/profiles\/[a-zA-Z0-9_-]+\/inspections$/,
    ["limit", "cursor", "since", "until", "decision", "human"],
  ],
  ["POST", /^api\/v1\/inspections\/[a-zA-Z0-9_-]+\/report$/, ["refresh"]],
];
export function forwardedQuery(
  method: string,
  segments: string[],
  params: URLSearchParams,
): URLSearchParams {
  const path = segments.join("/");
  const allowed =
    queryRoutes.find(([m, re]) => m === method && re.test(path))?.[2] ?? [];
  const out = new URLSearchParams();
  for (const key of allowed) {
    const value = params.get(key);
    if (value !== null && queryRules[key].test(value)) out.set(key, value);
  }
  return out;
}
/** Idempotency-Key is forwarded only when short and printable. */
export function idempotencyKey(value: string | null): string | null {
  return value && /^[\x21-\x7e]{1,200}$/.test(value) ? value : null;
}
export function upstreamError(
  status: number,
  body: unknown,
  token = "",
): string {
  const messages: Record<number, string> = {
    401: "The service credentials need to be checked by the administrator.",
    403: "The service denied this operation.",
    404: "This record is no longer available.",
    413: "The upload exceeds the service limit.",
    429: "The service is busy. Please try again shortly.",
  };
  // 429 keeps a safe backend reason (e.g. the AI description limit) so users know why.
  if (messages[status] && status !== 429) return messages[status];
  if ([400, 409, 415, 422, 429].includes(status)) {
    const detail =
      body && typeof body === "object" && "detail" in body ? body.detail : null;
    const text =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) =>
                typeof item?.msg === "string" ? item.msg : "Invalid input",
              )
              .join("; ")
          : status === 429
            ? messages[429]
            : "The service could not accept this request. Check its current state and the uploaded files.";
    if (text.length <= 2000 && !/[<>\r\n]/.test(text))
      return token ? text.replaceAll(token, "[redacted]") : text;
  }
  return "The inspection service encountered an error. Try again later.";
}
// Large reference sets (up to 200 images) are sent in one profile request.
export const MAX_BODY = 128 * 1024 * 1024;
export async function boundedBody(
  request: Request,
): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((c) => {
    result.set(c, offset);
    offset += c.byteLength;
  });
  return result;
}
