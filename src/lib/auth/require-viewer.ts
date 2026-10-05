/**
 * sm-app-template integration file. Template version: 1.0.0.
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
import { readConfig, type ConfigProblem } from "@/lib/config/env.server";
import { logEvent } from "@/lib/data/log";
import { warehouseFor, type Warehouse } from "@/lib/data/warehouse.server";
import { authenticateRequest, type Viewer } from "./authenticate";

export type { Viewer } from "./authenticate";

export type SampleAccess = { mode: "sample"; viewer: Viewer };
export type LiveAccess = { mode: "live"; viewer: Viewer; warehouse: Warehouse };
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

/** Once per request: React.cache scopes the result to one server render. */
const resolveViewer = cache(async (): Promise<ViewerAccess> => {
  const config = readConfig();
  if (config.status === "error") {
    logEvent({ event: "config_error", level: "error", variables: config.problems.map((p) => p.variable) });
    throw new ConfigurationError(config.problems);
  }
  const result = await authenticateRequest(config.guard, await headers());
  if (!result.ok) {
    logEvent({ event: "viewer_denied", level: "warn", guard: result.guard, error_reason: result.reason });
    throw new ViewerDeniedError();
  }
  return config.mode === "live"
    ? { mode: "live", viewer: result.viewer, warehouse: warehouseFor(config.live) }
    : { mode: "sample", viewer: result.viewer };
});

export async function requireViewer(): Promise<ViewerAccess>;
export async function requireViewer(options: { live: true }): Promise<LiveAccess>;
export async function requireViewer(options?: { live: true }): Promise<ViewerAccess> {
  const access = await resolveViewer();
  if (options?.live && access.mode !== "live") {
    throw new Error(
      "A live loader ran without live configuration; call it from the feature's queries.ts, which picks sample or live.",
    );
  }
  return access;
}
