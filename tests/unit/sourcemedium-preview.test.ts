import { describe, expect, it, vi } from "vitest";
import { runPreview, sourcemediumOrigin } from "../../scripts/sourcemedium-preview.mjs";

const ENV = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.example/issue?api-version=2.0",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner-request-token",
  GITHUB_SHA: "ab12cd34ef56".padEnd(40, "0"),
};
const BUILD = "8c0b2a54-5d3e-4f6e-9c7a-0e1f2a3b4c5d";

/** GitHub's token service plus SourceMedium's answers, in order per path. */
function services(answers: Record<string, Array<[number, unknown]>>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.startsWith("https://token.actions.example/"))
      return Response.json({ value: `oidc-for-${new URL(href).searchParams.get("audience")}` });
    const path = new URL(href).pathname.replace("/api/app-sources/v1/", "");
    const [status, body] = answers[path]?.shift() ?? [500, {}];
    return Response.json(body, { status });
  });
  return { fetch, calls };
}

function run(fetch: ReturnType<typeof services>["fetch"], env: Record<string, string | undefined> = ENV) {
  const log = vi.fn();
  const summary = vi.fn();
  const archive = vi.fn(() => new Uint8Array([0x1f, 0x8b]));
  const result = runPreview({ env, fetch, archive, sleep: async () => undefined, log, summary });
  return { result, log, summary, archive };
}

describe("SourceMedium preview workflow", () => {
  it("sends nothing from a repository that isn't connected", async () => {
    const { fetch, calls } = services({ repository: [[200, { connected: false }]] });
    const { result, log, archive } = run(fetch);
    await expect(result).resolves.toBe(0);
    expect(archive).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("nothing was sent"));
    // The token names SourceMedium's production origin as its audience.
    const [token, check] = calls;
    expect(token?.url).toContain("audience=https%3A%2F%2Furchin.sourcemedium.com");
    expect(check?.init?.headers).toMatchObject({
      Authorization: "Bearer oidc-for-https://urchin.sourcemedium.com",
    });
  });

  it("sends the connect code only when one was given, and fails when SourceMedium rejects it", async () => {
    const code = `smc_${"ab".repeat(24)}`;
    const refused = services({ repository: [[200, { connected: false }]] });
    const { result, log } = run(refused.fetch, { ...ENV, SOURCEMEDIUM_CONNECT_CODE: code });
    await expect(result).resolves.toBe(1);
    expect(refused.calls[1]?.init?.headers).toMatchObject({ "X-SourceMedium-Connect-Code": code });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("didn't accept that connect code"));

    const plain = services({ repository: [[200, { connected: false }]] });
    await run(plain.fetch).result;
    expect(plain.calls[1]?.init?.headers).not.toHaveProperty("X-SourceMedium-Connect-Code");
  });

  it("also sends nothing while SourceMedium builds are switched off", async () => {
    const { fetch } = services({ repository: [[503, { error: { code: "BUILDS_UNAVAILABLE" } }]] });
    const { result, archive, log } = run(fetch);
    await expect(result).resolves.toBe(0);
    expect(archive).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("::notice::"));
  });

  it("doesn't blame the connect code when SourceMedium builds are switched off", async () => {
    // 503 says builds are off for this SourceMedium, not that the code was refused, so the
    // run stays green and quiet and the code can be used again.
    const { fetch } = services({ repository: [[503, { error: { code: "BUILDS_UNAVAILABLE" } }]] });
    const { result, log, archive } = run(fetch, { ...ENV, SOURCEMEDIUM_CONNECT_CODE: `smc_${"ab".repeat(24)}` });
    await expect(result).resolves.toBe(0);
    expect(archive).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("::error::"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("connect code"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("isn't building apps from repositories"));
  });

  it("sends the commit and reports the preview once SourceMedium has built it", async () => {
    const { fetch, calls } = services({
      repository: [[200, { connected: true, app: { name: "Acme app" } }]],
      builds: [[202, { build: { id: BUILD } }]],
      [`builds/${BUILD}`]: [
        [200, { build: { state: "awaiting_artifact", build: "running" } }],
        [200, { build: { state: "verifying", build: "succeeded" } }],
        [200, { build: { state: "ready", build: "succeeded", previewHostname: "acme-app--x1.sourcemedium.app" } }],
      ],
    });
    const { result, log, summary } = run(fetch, {
      ...ENV,
      SOURCEMEDIUM_URL: "https://urchin-staging.sourcemedium.com",
    });
    await expect(result).resolves.toBe(0);
    const upload = calls.find((call) => call.url.endsWith("/builds") && call.init?.method === "POST");
    expect(upload?.init?.body).toEqual(new Uint8Array([0x1f, 0x8b]));
    expect(log).toHaveBeenCalledWith("Preview ready: https://acme-app--x1.sourcemedium.app/");
    expect(summary).toHaveBeenCalledWith(expect.stringContaining("acme-app--x1.sourcemedium.app"));
  });

  it("fails the job with the build's own log and reason", async () => {
    const { fetch } = services({
      repository: [[200, { connected: true }]],
      builds: [[202, { build: { id: BUILD } }]],
      [`builds/${BUILD}`]: [
        [
          200,
          {
            build: {
              state: "failed",
              build: "failed",
              log: "ERR_PNPM_OUTDATED_LOCKFILE",
              error: { code: "BUILD_FAILED", detail: "Installing dependencies failed." },
            },
          },
        ],
      ],
    });
    const { result, log } = run(fetch);
    await expect(result).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith("ERR_PNPM_OUTDATED_LOCKFILE");
    expect(log).toHaveBeenCalledWith("::error::Installing dependencies failed.");
  });

  it("succeeds quietly when a newer push replaced this build, and fails on a refused upload", async () => {
    const replaced = services({
      repository: [[200, { connected: true }]],
      builds: [[202, { build: { id: BUILD } }]],
      [`builds/${BUILD}`]: [
        [
          200,
          { build: { state: "failed", build: "cancelled", error: { detail: "A newer push replaced this build." } } },
        ],
      ],
    });
    await expect(run(replaced.fetch).result).resolves.toBe(0);

    const refused = services({
      repository: [[200, { connected: true }]],
      builds: [[409, { error: { code: "REPOSITORY_MOVED", message: "Connect it again." } }]],
    });
    const { result, log } = run(refused.fetch);
    await expect(result).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Connect it again."));
  });

  it("explains a missing id-token permission and sends only to SourceMedium or your computer", async () => {
    const { fetch } = services({});
    await expect(run(fetch, { GITHUB_SHA: ENV.GITHUB_SHA }).result).rejects.toThrow("id-token: write");
    expect(() => sourcemediumOrigin("http://urchin.example")).toThrow("https");
    expect(sourcemediumOrigin(undefined)).toBe("https://urchin.sourcemedium.com");
    // The source archive and this repository's identity token go nowhere else, whatever a
    // repository or organization variable says.
    expect(() => sourcemediumOrigin("https://urchin.example.com")).toThrow("sourcemedium.com");
    expect(() => sourcemediumOrigin("https://sourcemedium.com.example.test")).toThrow("sourcemedium.com");
    expect(sourcemediumOrigin("https://urchin-staging.sourcemedium.com")).toBe(
      "https://urchin-staging.sourcemedium.com",
    );
    expect(sourcemediumOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(sourcemediumOrigin("http://127.0.0.1:8787/api")).toBe("http://127.0.0.1:8787");
  });
});
