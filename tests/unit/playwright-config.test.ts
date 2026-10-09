import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextEnv from "@next/env";
import { sampleEnvironment } from "../../scripts/lib/sample-env";

// The host's real dotenv files are outside this test; environment injection is the boundary under test.
vi.mock("@next/env", () => ({ default: { loadEnvConfig: vi.fn() } }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("SM_HOSTED_E2E", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("browser checks in a cloud agent environment", () => {
  it("keeps every sample server isolated from injected live credentials", async () => {
    vi.stubEnv("SM_LIVE_E2E", "");
    vi.stubEnv("SM_APP_KEY", "synthetic-live-key");
    vi.stubEnv("APP_BASIC_AUTH", "viewer:synthetic-live-password-0123456789");
    vi.stubEnv("APP_REQUIRE_LIVE", "true");
    const { default: config } = await import("../../playwright.config");
    expect(config.projects?.map((project) => project.name)).not.toContain("live");
    const servers = [config.webServer].flat();
    expect(servers).toHaveLength(3);
    for (const server of servers) {
      expect(server?.env?.SM_APP_KEY).toBe("");
      expect(server?.env?.APP_BASIC_AUTH).not.toBe(process.env.APP_BASIC_AUTH);
      for (const name of Object.keys(sampleEnvironment).filter(
        (name) => !["APP_BASIC_AUTH", "APP_STORE_ID"].includes(name),
      )) {
        expect(server?.env?.[name]).toBe("");
      }
    }
  });

  it("uses injected Basic auth for live checks without recording authenticated browser traffic", async () => {
    vi.stubEnv("SM_LIVE_E2E", "1");
    vi.stubEnv("CI", "true");
    vi.stubEnv("SM_APP_KEY", "synthetic-live-key");
    vi.stubEnv("APP_BASIC_AUTH", "viewer:synthetic-live-password-0123456789");
    const { default: config } = await import("../../playwright.config");
    expect(config.projects).toHaveLength(1);
    expect(config.projects?.[0]?.use?.httpCredentials).toEqual({
      username: "viewer",
      password: "synthetic-live-password-0123456789",
      origin: "http://127.0.0.1:3108",
    });
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect(config.reporter).toBe("list");
    expect(config.workers).toBe(1);
    expect(config.retries).toBe(0);
  });

  it("names the missing Development configuration before starting a live server", async () => {
    vi.stubEnv("SM_LIVE_E2E", "1");
    vi.stubEnv("SM_APP_KEY", "");
    vi.stubEnv("APP_BASIC_AUTH", "");
    await expect(import("../../playwright.config")).rejects.toThrow("complete Development app block");
  });
});

describe("hosted browser checks", () => {
  beforeEach(() => {
    vi.stubEnv("SM_HOSTED_E2E", "1");
    vi.stubEnv("SM_HOSTED_URL", "https://preview.example.com");
    vi.stubEnv("SM_EXPECTED_COMMIT", "a".repeat(40));
    vi.stubEnv("APP_BASIC_AUTH", "viewer:synthetic:password");
    vi.stubEnv("SM_APP_KEY", "");
  });

  it("reuses live tests without a local server, dotenv, or warehouse key and limits credentials to the target", async () => {
    const { default: config } = await import("../../playwright.config");
    expect(nextEnv.loadEnvConfig).not.toHaveBeenCalled();
    expect(config.webServer).toEqual([]);
    expect(config.globalSetup).toBe("./e2e/hosted.setup.ts");
    expect(config.projects).toHaveLength(1);
    expect(config.projects?.[0]?.use).toMatchObject({
      baseURL: "https://preview.example.com",
      httpCredentials: { username: "viewer", password: "synthetic:password", origin: "https://preview.example.com" },
    });
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect(config.preserveOutput).toBe("never");
  });

  it.each([
    "",
    "not a URL",
    "http://preview.example.com",
    "https://viewer:secret@example.com",
    "https://preview.example.com/overview",
    "https://preview.example.com?key=secret",
    "https://preview.example.com#secret",
  ])("rejects an unsafe or ambiguous target without echoing it: %s", async (url) => {
    vi.stubEnv("SM_HOSTED_URL", url);
    await expect(import("../../playwright.config")).rejects.toThrow(
      "Hosted checks need an HTTPS origin without credentials, a path, query, or fragment.",
    );
  });

  it.each(["", "abcdef123456", "not-a-commit"])("requires a full commit: %s", async (commit) => {
    vi.stubEnv("SM_EXPECTED_COMMIT", commit);
    await expect(import("../../playwright.config")).rejects.toThrow("full 40-character Git commit");
  });

  it("does not fall back to the checkout's dotenv password", async () => {
    vi.stubEnv("APP_BASIC_AUTH", "");
    await expect(import("../../playwright.config")).rejects.toThrow("Hosted checks need APP_BASIC_AUTH");
    expect(nextEnv.loadEnvConfig).not.toHaveBeenCalled();
  });
});
