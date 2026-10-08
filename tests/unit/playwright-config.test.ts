import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleEnvironment } from "../../scripts/lib/sample-env";

// The host's real dotenv files are outside this test; environment injection is the boundary under test.
vi.mock("@next/env", () => ({ default: { loadEnvConfig: vi.fn() } }));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("browser checks in a cloud agent environment", () => {
  it("keeps every sample server isolated from injected live credentials", async () => {
    vi.stubEnv("SM_LIVE_E2E", "");
    vi.stubEnv("SM_APP_KEY", "synthetic-live-key");
    vi.stubEnv("APP_BASIC_AUTH", "viewer:synthetic-live-password-0123456789");
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
