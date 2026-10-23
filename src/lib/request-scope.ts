/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * `requestScoped(compute)` runs `compute` once per request and shares its
 * result with every later call in that request, wherever it runs: a server
 * render, a route handler or a server action. React's `cache` does this only
 * inside a render, so in a route handler (a CSV export, an API) each layer's
 * call to a guard re-ran everything behind it.
 *
 * The key is the request's own headers object. Next gives each request one
 * sealed instance and returns it from every `headers()` call, so one key is
 * one request's content, and a result is never shared between requests. If a
 * Next release ever returned a new object per call, that is a cache miss (the
 * old behavior in a route handler), not another request's data. `compute`
 * receives the key it is stored under, so a result is a function of its key
 * by construction, not because two reads of `headers()` agree.
 */
import "server-only";
import { headers } from "next/headers";

type RequestHeaders = Awaited<ReturnType<typeof headers>>;

export function requestScoped<T>(compute: (request: RequestHeaders) => Promise<T>): () => Promise<T> {
  const results = new WeakMap<object, Promise<T>>();
  return async () => {
    const request = await headers();
    let result = results.get(request);
    if (result === undefined) {
      result = compute(request);
      results.set(request, result);
    }
    return result;
  };
}
