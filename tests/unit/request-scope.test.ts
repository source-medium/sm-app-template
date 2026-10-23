/** requestScoped shares one result per request, and never between requests. */
import { describe, expect, it, vi } from "vitest";
import { requestHeaders } from "../helpers/live";

vi.unmock("@/lib/request-scope");
const { requestScoped } = await import("@/lib/request-scope");

/** The next calls belong to a new request: Next gives each one its own headers object. */
const newRequest = () => (requestHeaders.current = new Headers());

describe("requestScoped", () => {
  it("computes once for every call in a request, sequential or concurrent", async () => {
    const compute = vi.fn(async () => ({}));
    const scoped = requestScoped(compute);
    newRequest();
    const [first, second] = await Promise.all([scoped(), scoped()]);
    expect(await scoped()).toBe(first);
    expect(second).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("never shares a result between requests, even when they overlap", async () => {
    let count = 0;
    const scoped = requestScoped(async () => ++count);
    // `headers()` is read when the call starts, so these two are in flight together.
    const a = (newRequest(), scoped());
    const b = (newRequest(), scoped());
    expect([await a, await b]).toEqual([1, 2]);
    expect(await scoped()).toBe(2);
  });

  it("shares a failure within the request, like a result, and not with the next request", async () => {
    let count = 0;
    const scoped = requestScoped(async () => {
      if (++count === 1) throw new Error("first request fails");
      return "recovered";
    });
    newRequest();
    const first = await scoped().catch((error: unknown) => error);
    expect(await scoped().catch((error: unknown) => error)).toBe(first);
    newRequest();
    await expect(scoped()).resolves.toBe("recovered");
  });

  it("computes from the headers it stores the result under, even if the request changes as the call starts", async () => {
    const scoped = requestScoped(async (request) => request);
    const a = newRequest();
    const first = scoped();
    const b = newRequest();
    const second = scoped();
    expect(await first).toBe(a);
    expect(await second).toBe(b);
  });

  it("keeps each scoped function's result apart", async () => {
    const one = requestScoped(async () => "one");
    const two = requestScoped(async () => "two");
    newRequest();
    expect([await one(), await two()]).toEqual(["one", "two"]);
  });
});
