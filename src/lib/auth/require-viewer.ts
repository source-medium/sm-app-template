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
import { cache } from "react";
import { headers } from "next/headers";
import { buildId, readConfig, type ConfigProblem, type ManagedApiConfig } from "@/lib/config/env.server";
import { logEvent } from "@/lib/data/log";
import { loadManagedContext } from "@/lib/data/managed-api.server";
import { managedWarehouse, refusedWarehouse, warehouseFor, type Warehouse } from "@/lib/data/warehouse.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { authenticateRequest, type Viewer } from "./authenticate";
import { isLoopbackRequest } from "./loopback";
import { readSourceMediumViewer } from "./sourcemedium-viewer";
import { assertStoreAccess } from "./store-access";

export type { Viewer } from "./authenticate";

export type SampleAccess = { mode: "sample"; viewer: Viewer; storeId: string | null };
export type LiveAccess = {
  mode: "live";
  viewer: Viewer;
  storeId: string | null;
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
async function managedAccess(managed: ManagedApiConfig, viewer: Viewer): Promise<LiveAccess> {
  const client = { ...managed, buildId: buildId() };
  try {
    return {
      mode: "live",
      viewer,
      storeId: null,
      warehouse: managedWarehouse(client, await loadManagedContext(client)),
    };
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return { mode: "live", viewer, storeId: null, warehouse: refusedWarehouse(error), refusal: error };
  }
}

/** Once per request: React.cache scopes the result to one server render. */
const resolveViewer = cache(async (): Promise<ViewerAccess> => {
  const config = readConfig();
  if (config.status === "error") {
    logEvent({ event: "config_error", level: "error", variables: config.problems.map((p) => p.variable) });
    throw new ConfigurationError(config.problems);
  }
  const requestHeaders = await headers();
  if (config.mode === "managed") {
    // SourceMedium's gateway is the only way in and sets this header on every
    // request; without it, nothing is served (no sample fallback).
    const viewer = readSourceMediumViewer(requestHeaders);
    if (!viewer) {
      logEvent({ event: "viewer_denied", level: "warn", guard: "sourcemedium", error_reason: "missing" });
      throw new ViewerDeniedError();
    }
    return managedAccess(config.managed, viewer);
  }
  if (config.mode === "managed-dev") {
    if (!isLoopbackRequest(requestHeaders)) {
      logEvent({ event: "viewer_denied", level: "warn", guard: "loopback", error_reason: "foreign_host" });
      throw new ViewerDeniedError();
    }
    return managedAccess(config.managed, { kind: "developer" });
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
        warehouse: warehouseFor(config.live, config.storeId),
      }
    : { mode: "sample", viewer: result.viewer, storeId: config.storeId };
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
