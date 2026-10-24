/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * requireViewer() runs before every data read. It re-derives the mode from
 * configuration, authenticates the request with the configured guard, and
 * is the only place a page can obtain a Warehouse. Middleware challenges
 * earlier for a friendlier prompt; this is the guard that cannot be skipped.
 *
 * `pnpm check` fails when a feature's bigquery.ts or queries.ts loader, a
 * route handler, or a server action does not call it.
 */
import "server-only";
import { buildId, readConfig, type ConfigProblem, type ManagedApiConfig } from "@/lib/config/env.server";
import { logEvent } from "@/lib/data/log";
import { requestScoped } from "@/lib/request-scope";
import { loadManagedContext } from "@/lib/data/managed-api.server";
import { managedWarehouse, refusedWarehouse, warehouseFor, type Warehouse } from "@/lib/data/warehouse.server";
import { newRequestContext, type RequestContext } from "@/lib/data/request-context";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { authenticateRequest, type Viewer } from "./authenticate";
import { isLoopbackRequest } from "./loopback";
import { readSourceMediumViewer } from "./sourcemedium-viewer";
import { assertStoreAccess } from "./store-access";

export type { Viewer } from "./authenticate";

export type SampleAccess = { mode: "sample"; viewer: Viewer; storeId: string | null; request: RequestContext };
export type LiveAccess = {
  mode: "live";
  viewer: Viewer;
  storeId: string | null;
  /** This request's id, cache bypass and what the cache served it (src/lib/data/request-context.ts). */
  request: RequestContext;
  warehouse: Warehouse;
  /** A managed app's refused data context; `warehouse` raises it on every read. */
  refusal?: WarehouseError;
};
export type ViewerAccess = SampleAccess | LiveAccess;

export class ConfigurationError extends Error {
  constructor(readonly problems: ConfigProblem[]) {
    super("The app's configuration is invalid; run `pnpm diagnose` for details.");
    this.name = "ConfigurationError";
  }
}

export class ViewerDeniedError extends Error {
  constructor() {
    super("This request is not signed in.");
    this.name = "ViewerDeniedError";
  }
}

/**
 * A managed app's live access, loading its data context once per request. The
 * data API can refuse or fail that load (app paused, access changed, outage),
 * and the refusal rides in the Warehouse, never as sample data: the guard
 * itself only denies for sign-in or configuration, which middleware answers
 * before any handler runs, so every route handler can start with it unwrapped.
 */
async function managedAccess(managed: ManagedApiConfig, viewer: Viewer, request: RequestContext): Promise<LiveAccess> {
  const client = { ...managed, buildId: buildId() };
  try {
    return {
      mode: "live",
      viewer,
      storeId: null,
      request,
      warehouse: managedWarehouse(client, await loadManagedContext(client), request),
    };
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    logEvent({
      event: "managed_context_refused",
      level: error.status !== null && error.status < 500 ? "warn" : "error",
      build: client.buildId,
      request_id: error.requestId,
      error_kind: error.kind,
      error_reason: error.reason,
      http_status: error.status,
    });
    return { mode: "live", viewer, storeId: null, request, warehouse: refusedWarehouse(error), refusal: error };
  }
}

/** Once per request, in a render, a route handler or a server action (src/lib/request-scope.ts). */
const resolveViewer = requestScoped(async (requestHeaders): Promise<ViewerAccess> => {
  const config = readConfig();
  if (config.status === "error") {
    logEvent({ event: "config_error", level: "error", variables: config.problems.map((p) => p.variable) });
    throw new ConfigurationError(config.problems);
  }
  const request = newRequestContext();
  if (config.mode === "managed") {
    // SourceMedium's gateway is the only way in and sets this header on every
    // request; without it, nothing is served (no sample fallback).
    const viewer = readSourceMediumViewer(requestHeaders);
    if (!viewer) {
      logEvent({ event: "viewer_denied", level: "warn", guard: "sourcemedium", error_reason: "missing" });
      throw new ViewerDeniedError();
    }
    return managedAccess(config.managed, viewer, request);
  }
  if (config.mode === "managed-dev") {
    if (!isLoopbackRequest(requestHeaders)) {
      logEvent({ event: "viewer_denied", level: "warn", guard: "loopback", error_reason: "foreign_host" });
      throw new ViewerDeniedError();
    }
    return managedAccess(config.managed, { kind: "developer" }, request);
  }
  const result = await authenticateRequest(config.guard, requestHeaders);
  if (!result.ok) {
    logEvent({ event: "viewer_denied", level: "warn", guard: result.guard, error_reason: result.reason });
    throw new ViewerDeniedError();
  }
  return config.mode === "live"
    ? {
        mode: "live",
        viewer: result.viewer,
        storeId: config.storeId,
        request,
        warehouse: warehouseFor(config.live, config.storeId, request),
      }
    : { mode: "sample", viewer: result.viewer, storeId: config.storeId, request };
});

export async function requireViewer(options: { live: true; storeId?: string }): Promise<LiveAccess>;
export async function requireViewer(options?: { storeId?: string }): Promise<ViewerAccess>;
export async function requireViewer(options?: { live?: true; storeId?: string }): Promise<ViewerAccess> {
  const access = await resolveViewer();
  if (options && "storeId" in options) assertStoreAccess(access.storeId, options.storeId);
  if (options?.live && access.mode !== "live") {
    throw new Error(
      "A live loader ran without live configuration; call it from the feature's queries.ts, which picks sample or live.",
    );
  }
  return access;
}
