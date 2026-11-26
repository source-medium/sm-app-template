/**
 * Byte ranges (RFC 9110 §14) for complete files, applied by `worker.ts` to
 * every response. The ASSETS binding answers a public/ file whole, with 200,
 * whatever Range asks, and Safari and iOS play no <video> whose server ignores
 * Range.
 *
 * Only a GET or HEAD answered 200 with a strong ETag qualifies: every asset
 * carries one and the app's pages carry none, and If-Range needs one to tell
 * that a later range is of the same file. One `bytes=` range is answered with
 * 206 (or 416 past the end); several ranges, another unit or a changed file
 * get the whole file, as the RFC allows.
 */
export async function withByteRanges(request: Request, response: Response): Promise<Response> {
  const etag = response.headers.get("ETag");
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    response.status !== 200 ||
    !etag ||
    etag.startsWith("W/") ||
    response.headers.has("Content-Encoding")
  )
    return response;
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  const range = request.method === "GET" ? request.headers.get("Range") : null;
  const ifRange = request.headers.get("If-Range");
  const spec = range && (ifRange === null || ifRange === etag) ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!spec) return new Response(response.body, { status: 200, statusText: response.statusText, headers });

  const body = new Uint8Array(await response.arrayBuffer());
  const size = body.byteLength;
  const [, first = "", last = ""] = spec;
  const bounds = first
    ? {
        start: Number(first),
        end: last ? Math.min(Number(last), size - 1) : size - 1,
        valid: !last || Number(last) >= Number(first),
      }
    : { start: Math.max(size - Number(last), 0), end: size - 1, valid: last !== "" };
  if (!bounds.valid) return new Response(body, { status: 200, statusText: response.statusText, headers });
  headers.delete("Content-Length");
  if (bounds.start >= size || (!first && Number(last) === 0)) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${bounds.start}-${bounds.end}/${size}`);
  return new Response(body.slice(bounds.start, bounds.end + 1), { status: 206, headers });
}
