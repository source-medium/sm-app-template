/**
 * An app SourceMedium hosts (docs/managed.md): the gateway signs the viewer in
 * and sets X-SM-Viewer, and data goes through the gateway's outbound Worker,
 * so the app holds no credential. The viewer header is read against the
 * vendored contract's own examples.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { readSourceMediumViewer, VIEWER_HEADER } from "@/lib/auth/sourcemedium-viewer";
import { describeConfig, instanceInfo, parseConfig } from "@/lib/config/env.server";
import { requestHeaders } from "../helpers/live";
import { contractExample, examples } from "../helpers/managed";

const VIEWER_CONTEXT = contractExample("context", "viewer").value;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const member = contractExample("viewer_header", "member").value;

const HOSTED = {
  SM_HOSTING: "managed",
  SM_DATA_API_URL: "https://urchin.test/api/app-data/v1",
  SM_APP_ID: "0b2c3d4e-0000-4000-8000-000000000001",
  SM_DEPLOYMENT_ID: "0b2c3d4e-0000-4000-8000-000000000d01",
};

function hostedEnv() {
  for (const [name, value] of Object.entries(HOSTED)) vi.stubEnv(name, value);
}

describe("hosted configuration", () => {
  it("takes the deploy's ids and the data API, and no credential", () => {
    expect(parseConfig(HOSTED)).toEqual({
      status: "ok",
      mode: "managed",
      guard: null,
      managed: { dataApiUrl: "https://urchin.test/api/app-data/v1", developerToken: null },
      hosted: { appId: HOSTED.SM_APP_ID, deploymentId: HOSTED.SM_DEPLOYMENT_ID, authMethod: "workspace" },
      storeId: null,
    });
  });

  it("labels probe access and staging without changing viewer authorization", async () => {
    const config = parseConfig({ ...HOSTED, SM_GATEWAY_AUTH: "probe" });
    expect(describeConfig(config)).toMatch(/shared staging probe access/);
    hostedEnv();
    vi.stubEnv("SM_GATEWAY_AUTH", "probe");
    vi.stubEnv("APP_ENVIRONMENT", "staging");
    expect(instanceInfo().environment).toBe("Staging");
    requestHeaders.current = new Headers({ host: "probe.apps.example" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer()).rejects.toThrow("not signed in");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["an unrecognized gateway sign-in mode", { SM_GATEWAY_AUTH: "custom" }, "SM_GATEWAY_AUTH"],
    ["a developer token", { SM_DEVELOPER_TOKEN: `smapp_${"a".repeat(43)}` }, "SM_DEVELOPER_TOKEN"],
    ["a local data API over http", { SM_DATA_API_URL: "http://127.0.0.1:3000/api/app-data/v1" }, "SM_DATA_API_URL"],
    ["no deployment id, as on a laptop", { SM_DEPLOYMENT_ID: undefined }, "SM_DEPLOYMENT_ID"],
    ["a Google key", { SM_APP_KEY: "key" }, "SM_APP_KEY"],
    ["a shared password", { APP_BASIC_AUTH: `viewer:${"p".repeat(24)}` }, "APP_BASIC_AUTH"],
  ])("refuses %s", (_name, override, variable) => {
    const config = parseConfig({ ...HOSTED, ...override });
    expect(config.status).toBe("error");
    if (config.status === "error") expect(config.problems.map((problem) => problem.variable)).toContain(variable);
  });
});

describe("the gateway's viewer header", () => {
  it.each(examples.viewer_header.valid)("reads $case", ({ value }) => {
    expect(readSourceMediumViewer(new Headers({ [VIEWER_HEADER]: encode(value) }))).toEqual({
      kind: "sourcemedium",
      access: value.kind,
      userId: value.user_id,
      email: value.email,
      name: value.name,
      organizationId: value.organization_id,
    });
  });

  it.each(examples.viewer_header.invalid)("refuses $case", ({ value }) => {
    expect(readSourceMediumViewer(new Headers({ [VIEWER_HEADER]: encode(value) }))).toBeNull();
  });

  it("reads a header at the schema's maximum lengths, which the gateway sends", () => {
    // Three UTF-8 bytes per character: about 2,300 characters encoded.
    const longest = { ...member, email: "€".repeat(320), name: "€".repeat(200) };
    expect(encode(longest).length).toBeGreaterThan(2048);
    expect(readSourceMediumViewer(new Headers({ [VIEWER_HEADER]: encode(longest) }))).toMatchObject({
      email: longest.email,
      name: longest.name,
    });
  });

  it("reads a header up to the gateway's 4,096 characters and refuses a longer one", () => {
    const json = JSON.stringify(member);
    // JSON whitespace pads a valid header to `bytes` bytes; 3,072 bytes encode to 4,096 characters.
    const padded = (bytes: number) =>
      Buffer.from(`{${" ".repeat(bytes - Buffer.byteLength(json))}${json.slice(1)}`).toString("base64url");
    expect(padded(3072)).toHaveLength(4096);
    expect(readSourceMediumViewer(new Headers({ [VIEWER_HEADER]: padded(3072) }))).not.toBeNull();
    expect(readSourceMediumViewer(new Headers({ [VIEWER_HEADER]: padded(3073) }))).toBeNull();
  });

  it.each([
    ["missing", null],
    ["not base64url", "not+base64/=="],
    ["not JSON", Buffer.from("member").toString("base64url")],
    ["oversized", "A".repeat(4097)],
  ])("refuses a %s header", (_name, raw) => {
    expect(readSourceMediumViewer(new Headers(raw === null ? {} : { [VIEWER_HEADER]: raw }))).toBeNull();
  });
});

describe("requireViewer when hosted", () => {
  it("hands features a live Warehouse for the gateway's viewer, with no credential on the request", async () => {
    hostedEnv();
    requestHeaders.current = new Headers({ host: "acme-weekly.apps.example", [VIEWER_HEADER]: encode(member) });
    const fetch = vi.fn(async () => Response.json(VIEWER_CONTEXT));
    vi.stubGlobal("fetch", fetch);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    const access = await requireViewer({ live: true });
    expect(access).toMatchObject({
      mode: "live",
      viewer: { kind: "sourcemedium", access: "member", userId: member.user_id },
      storeId: null,
    });
    expect(access.warehouse.table("obt_orders")).toBe("`sm-acme.sm_transformed_v2.obt_orders`");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://urchin.test/api/app-data/v1/context");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("serves nothing, not even sample data, without the gateway's viewer", async () => {
    hostedEnv();
    requestHeaders.current = new Headers({ host: "acme-weekly.apps.example" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer()).rejects.toThrow("not signed in");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the app shell when hosted", () => {
  it("explains a refused data context in place of a blank error page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    hostedEnv();
    requestHeaders.current = new Headers({ host: "acme-weekly.apps.example", [VIEWER_HEADER]: encode(member) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "ACCESS_DENIED",
              message: "Paused.",
              retryable: false,
              request_id: "47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb",
            },
          },
          { status: 403 },
        ),
      ),
    );
    const { default: AppLayout } = await import("@/app/(app)/layout");
    const { DataAccessErrorScreen } = await import("@/components/shell/config-error");
    const element = (await AppLayout({ children: null })) as { type: unknown; props: Record<string, string> };
    expect(element.type).toBe(DataAccessErrorScreen);
    expect(element.props.title).toBe("SourceMedium refused this app's request");
    expect(element.props.remedy).toMatch(/paused or removed/);
    expect(element.props.requestId).toBe("47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb");
    expect(JSON.parse(String(warn.mock.calls.at(-1)?.[0]))).toMatchObject({
      event: "managed_context_refused",
      request_id: element.props.requestId,
      http_status: 403,
      error_kind: "permission_denied",
    });
    warn.mockRestore();
    expect(`${element.props.title} ${element.props.remedy}`).not.toMatch(/Google|BigQuery|key/i);
  });
});

describe("middleware when hosted", () => {
  it("passes a gateway-signed request and refuses any other, with no loopback rule", async () => {
    hostedEnv();
    const { middleware } = await import("@/middleware");
    const request = (headers: Record<string, string>) =>
      new NextRequest("https://acme-weekly.apps.example/overview", { headers: new Headers(headers) });
    expect((await middleware(request({ [VIEWER_HEADER]: encode(member) }))).status).toBe(200);
    expect((await middleware(request({}))).status).toBe(403);
    expect((await middleware(request({ [VIEWER_HEADER]: "forged" }))).status).toBe(403);
  });
});
