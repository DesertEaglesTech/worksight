/** Allow only the negotiated API surface, never an arbitrary upstream URL. */
export function allowedRoute(method: string, segments: string[]): boolean {
  if (segments.some(s => !/^[a-zA-Z0-9_.-]+$/.test(s) || s === "." || s === "..")) return false;
  const path = segments.join("/");
  const get = /^v1\/(capabilities|profiles|profiles\/[^/]+\/(versions|compare)|jobs\/[^/]+|inspections\/[^/]+|assets\/[^/]+)$/;
  const post = /^v1\/(profiles|profiles\/[^/]+\/(samples|build|rollback)|inspections|inspections\/[^/]+\/feedback)$/;
  return method === "GET" ? get.test(path) : method === "POST" && post.test(path);
}
export const MAX_BODY = 52 * 1024 * 1024;
export async function boundedBody(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw new Error("payload_too_large"); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0; chunks.forEach(c => { result.set(c, offset); offset += c.byteLength; }); return result;
}
