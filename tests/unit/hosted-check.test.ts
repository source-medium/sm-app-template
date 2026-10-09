import { createServer, type IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyHostedApp } from "../../e2e/hosted.setup";

const commit = "a".repeat(40);
const credentials = { username: "viewer", password: "synthetic-password" };
const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;

describe("deployed build gate over HTTP", () => {
  let baseURL: string;
  let calls: IncomingMessage[];
  let build: string;
  let guarded: boolean;
  let report: unknown;
  let connectionStatus: number;
  const server = createServer((req, res) => {
    calls.push(req);
    if (req.url === "/healthz") {
      res.end(JSON.stringify({ build }));
    } else if (guarded && req.headers.authorization !== authorization) {
      res.writeHead(401, { "www-authenticate": 'Basic realm="Viewer"' });
      res.end();
    } else if (req.url === "/connection/check") {
      if (req.method !== "POST" || req.headers.origin !== baseURL) {
        res.writeHead(403).end();
      } else {
        res.writeHead(connectionStatus).end(JSON.stringify(report));
      }
    } else res.end("synthetic public response");
  });

  beforeEach(async () => {
    calls = [];
    build = commit.slice(0, 12);
    guarded = true;
    connectionStatus = 200;
    report = { mode: "live", checks: [{ status: "pass" }, { status: "warning" }] };
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    baseURL = `http://127.0.0.1:${address.port}`;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    vi.restoreAllMocks();
  });

  it("checks build, anonymous documents/assets/RSC/POST, then authenticated Connection, allowing warnings", async () => {
    await verifyHostedApp(baseURL, commit, credentials);
    expect(calls.some((req) => req.headers.rsc === "1")).toBe(true);
    expect(calls.some((req) => req.url === "/robots.txt" && !req.headers.authorization)).toBe(true);
    expect(calls.at(-1)?.headers.authorization).toBe(authorization);
    expect(calls.at(-1)?.headers.origin).toBe(baseURL);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 warnings"));
  });

  it("rejects the wrong commit before sending credentials or querying data", async () => {
    build = "b".repeat(12);
    await expect(verifyHostedApp(baseURL, commit, credentials)).rejects.toThrow("build identity");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });

  it("rejects an unguarded deployment before sending credentials", async () => {
    guarded = false;
    await expect(verifyHostedApp(baseURL, commit, credentials)).rejects.toThrow("anonymous viewer guard");
    expect(calls.every((req) => !req.headers.authorization)).toBe(true);
    expect(calls.some((req) => req.url === "/connection/check")).toBe(false);
  });

  it.each([
    { mode: "sample", checks: [{ status: "pass" }] },
    { mode: "live", checks: [{ status: "fail", message: "synthetic-sensitive-value" }] },
    { mode: "live", checks: [] },
    { mode: "live", checks: [{ status: "unknown" }] },
    { mode: "live" },
  ])("rejects unusable Connection reports without printing their contents: %j", async (invalidReport) => {
    report = invalidReport;
    await expect(verifyHostedApp(baseURL, commit, credentials)).rejects.toThrow(
      /^Hosted verification failed: live Connection check \(use its safe report for details\)\. No report tests were run\. See docs\/cloud.md#verify-a-hosted-build\.$/,
    );
  });

  it("rejects invalid viewer credentials", async () => {
    await expect(verifyHostedApp(baseURL, commit, { ...credentials, password: "wrong" })).rejects.toThrow(
      "live Connection check",
    );
  });

  it("rejects an unavailable warehouse", async () => {
    connectionStatus = 503;
    await expect(verifyHostedApp(baseURL, commit, credentials)).rejects.toThrow("live Connection check");
  });
});
