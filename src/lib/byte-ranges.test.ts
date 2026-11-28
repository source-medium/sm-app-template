import { describe, expect, it } from "vitest";
import { withByteRanges } from "./byte-ranges";

const FILE = new TextEncoder().encode("0123456789");
const ETAG = '"abc123"';
const asset = (headers: Record<string, string> = {}) =>
  new Response(FILE, { headers: { ETag: ETAG, "Content-Type": "video/mp4", ...headers } });
const get = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://app.example/sample-creatives/clip.mp4", { method, headers });

async function answer(request: Request, response = asset()) {
  const result = await withByteRanges(request, response);
  return {
    status: result.status,
    range: result.headers.get("Content-Range"),
    accept: result.headers.get("Accept-Ranges"),
    type: result.headers.get("Content-Type"),
    body: result.body ? await result.text() : null,
  };
}

describe("byte ranges for complete files", () => {
  it.each([
    ["bytes=0-1", "01", "bytes 0-1/10"],
    ["bytes=4-", "456789", "bytes 4-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=8-99", "89", "bytes 8-9/10"],
    ["bytes=-50", "0123456789", "bytes 0-9/10"],
  ])("answers %s with 206 and only those bytes", async (range, body, contentRange) => {
    expect(await answer(get({ Range: range }))).toEqual({
      status: 206,
      range: contentRange,
      accept: "bytes",
      type: "video/mp4",
      body,
    });
  });

  it("answers a range past the end with 416 and the file's size", async () => {
    for (const range of ["bytes=10-", "bytes=-0"])
      expect(await answer(get({ Range: range }))).toMatchObject({ status: 416, range: "bytes */10", body: null });
  });

  it("sends the whole file, advertising ranges, when none can be answered", async () => {
    const unanswerable: Record<string, string>[] = [
      {},
      { Range: "bytes=0-1,4-5" },
      { Range: "items=0-1" },
      { Range: "bytes=5-2" },
      { Range: "bytes=-" },
      { Range: "bytes=0-1", "If-Range": '"changed"' },
    ];
    for (const headers of unanswerable)
      expect(await answer(get(headers)), JSON.stringify(headers)).toEqual({
        status: 200,
        range: null,
        accept: "bytes",
        type: "video/mp4",
        body: "0123456789",
      });
    expect(await answer(get({ Range: "bytes=0-1", "If-Range": ETAG }))).toMatchObject({ status: 206, body: "01" });
  });

  it("leaves pages, errors, changing files and other methods as they were", async () => {
    const page = new Response("<html>", { headers: { "Content-Type": "text/html" } });
    const cases: [Request, Response][] = [
      [get({ Range: "bytes=0-1" }), page],
      [get({ Range: "bytes=0-1" }), asset({ ETag: 'W/"weak"' })],
      [get({ Range: "bytes=0-1" }), asset({ "Content-Encoding": "gzip" })],
      [get({ Range: "bytes=0-1" }), new Response("denied", { status: 401, headers: { ETag: ETAG } })],
      [get({ Range: "bytes=0-1" }, "POST"), asset()],
    ];
    for (const [request, response] of cases) expect(await withByteRanges(request, response)).toBe(response);
  });

  it("advertises ranges to a HEAD request without answering one", async () => {
    const result = await withByteRanges(
      get({ Range: "bytes=0-1" }, "HEAD"),
      new Response(null, { headers: { ETag: ETAG } }),
    );
    expect([result.status, result.headers.get("Accept-Ranges"), result.headers.get("Content-Range")]).toEqual([
      200,
      "bytes",
      null,
    ]);
  });
});
