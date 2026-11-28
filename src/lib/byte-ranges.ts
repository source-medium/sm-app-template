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
 *
 * A file that declares its size (Content-Length) is sliced as it streams, so a
 * range holds only a chunk of the file in memory at a time; one that does not
 * is read whole to learn its size.
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

  const declared = response.headers.get("Content-Length");
  const stream = declared && /^\d+$/.test(declared) ? response.body : null;
  const whole = stream ? null : new Uint8Array(await response.arrayBuffer());
  const size = whole ? whole.byteLength : Number(declared);
  const [, first = "", last = ""] = spec;
  const bounds = first
    ? {
        start: Number(first),
        end: last ? Math.min(Number(last), size - 1) : size - 1,
        valid: !last || Number(last) >= Number(first),
      }
    : { start: Math.max(size - Number(last), 0), end: size - 1, valid: last !== "" };
  if (!bounds.valid) return new Response(stream ?? whole, { status: 200, statusText: response.statusText, headers });
  headers.delete("Content-Length");
  if (bounds.start >= size || (!first && Number(last) === 0)) {
    await stream?.cancel();
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${bounds.start}-${bounds.end}/${size}`);
  const body = stream
    ? slice(stream, bounds.start, bounds.end - bounds.start + 1)
    : whole?.slice(bounds.start, bounds.end + 1);
  return new Response(body, { status: 206, headers });
}

/**
 * workerd sends a FixedLengthStream body with Content-Length, as it does a byte
 * array; any other stream it sends chunked. Node, where the unit tests run, has none.
 */
const FixedLengthStream = (
  globalThis as { FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array> }
).FixedLengthStream;

/** The `length` bytes of `file` from `start`, read as they arrive; reading stops once they have. */
function slice(file: ReadableStream<Uint8Array>, start: number, length: number): ReadableStream<Uint8Array> {
  const end = start + length;
  let offset = 0;
  const range = file.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const from = offset;
        offset += chunk.byteLength;
        if (offset > start) controller.enqueue(chunk.subarray(Math.max(start - from, 0), end - from));
        // Closes the range and cancels the rest of the file.
        if (offset >= end) controller.terminate();
      },
    }),
  );
  return FixedLengthStream ? range.pipeThrough(new FixedLengthStream(length)) : range;
}
