/**
 * Byte ranges in the runtime Cloudflare deploys: a file that declares its size
 * is sliced as it streams into workerd's FixedLengthStream, which workerd sends
 * with Content-Length (a plain stream would go chunked).
 */
import { expect, it } from "vitest";
import { withByteRanges } from "@/lib/byte-ranges";

const ETAG = '"abc123"';
const file = (text: string, size: number) =>
  new Response(text, { headers: { ETag: ETAG, "Content-Length": String(size) } });
const range = (value: string) =>
  new Request("https://app.example/sample-creatives/clip.mp4", { headers: { Range: value } });

it.each([
  ["bytes=0-1", "01", "bytes 0-1/1000"],
  ["bytes=995-", "56789", "bytes 995-999/1000"],
  ["bytes=-3", "789", "bytes 997-999/1000"],
])("streams only %s of a file that declares its size", async (value, body, contentRange) => {
  const result = await withByteRanges(range(value), file("0123456789".repeat(100), 1000));
  expect([result.status, result.headers.get("Content-Range"), await result.text()]).toEqual([206, contentRange, body]);
});

it("fails a range the file ends before, rather than sending it short", async () => {
  const result = await withByteRanges(range("bytes=5-14"), file("0123456789", 20));
  expect(result.status).toBe(206);
  await expect(result.text()).rejects.toThrow();
});
