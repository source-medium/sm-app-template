import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { signIn, sourceMediumOrigin, withManagedDevValues } from "../../scripts/lib/signin";

/**
 * A stand-in SourceMedium: /apps/dev-login "allows" at once by redirecting to
 * the program's loopback port with a code, and the token endpoint checks the
 * PKCE verifier the way the real one does.
 */
function fakeSourceMedium(options: { tamperState?: boolean } = {}) {
  const issued = new Map<string, string>();
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/apps/dev-login") {
      const code = "C".repeat(43);
      issued.set(code, url.searchParams.get("code_challenge") ?? "");
      const callback = new URL(`http://127.0.0.1:${url.searchParams.get("port")}/callback`);
      callback.searchParams.set("code", code);
      callback.searchParams.set(
        "state",
        options.tamperState ? "forged-state-value" : (url.searchParams.get("state") ?? ""),
      );
      response.writeHead(303, { location: callback.href }).end();
      return;
    }
    if (url.pathname === "/api/app-dev/v1/token" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const { code, code_verifier } = JSON.parse(body) as { code: string; code_verifier: string };
        const challenge = createHash("sha256").update(code_verifier).digest("base64url");
        if (issued.get(code) !== challenge) {
          response.writeHead(400, { "content-type": "application/json" }).end(
            JSON.stringify({
              error: { code: "SIGN_IN_EXPIRED", message: "This sign-in expired or was already used." },
            }),
          );
          return;
        }
        issued.delete(code);
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            token: `smapp_${"t".repeat(43)}`,
            expiresAt: "2026-12-09T15:00:00.000Z",
            dataApiUrl: "https://urchin.example.test/api/app-data/v1",
            app: { name: "Reporting app" },
            workspace: { name: "DemoCo" },
          }),
        );
      });
      return;
    }
    response.writeHead(404).end();
  });
  return server;
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});
async function start(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
/** The browser: follow the Allow page's redirect to the loopback callback. */
const browser = async (url: string) => {
  await fetch(url);
};

describe("pnpm signin", () => {
  it("gets a token through the loopback callback and PKCE", async () => {
    const origin = await start(fakeSourceMedium());
    const lines: string[] = [];
    const result = await signIn({
      origin,
      client: "test-mac",
      openBrowser: browser,
      log: (line) => lines.push(line),
      fetch,
    });
    expect(result).toMatchObject({ token: `smapp_${"t".repeat(43)}`, app: { name: "Reporting app" } });
    expect(lines.join("\n")).toContain(`${origin}/apps/dev-login?port=`);
    expect(lines.join("\n")).toContain("code_challenge_method=S256");
  });

  it("refuses a reply whose state is not this sign-in's", async () => {
    const origin = await start(fakeSourceMedium({ tamperState: true }));
    await expect(
      signIn({ origin, client: "test-mac", openBrowser: browser, log: () => undefined, fetch }),
    ).rejects.toThrow("did not match");
  });

  it("gives up after its deadline when nobody allows it", async () => {
    const origin = await start(fakeSourceMedium());
    await expect(
      signIn({ origin, client: "test-mac", openBrowser: () => undefined, log: () => undefined, fetch, timeoutMs: 50 }),
    ).rejects.toThrow("timed out");
  });

  it("accepts SourceMedium over https only, or a loopback address", () => {
    expect(sourceMediumOrigin(undefined)).toBe("https://urchin.sourcemedium.com");
    expect(sourceMediumOrigin("https://urchin-staging.sourcemedium.com/")).toBe(
      "https://urchin-staging.sourcemedium.com",
    );
    expect(sourceMediumOrigin("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(() => sourceMediumOrigin("http://urchin.sourcemedium.com")).toThrow("https://");
  });
});

describe(".env.local after signing in", () => {
  const values = {
    SM_HOSTING: "managed-dev",
    SM_DATA_API_URL: "https://urchin.example.test/api/app-data/v1",
    SM_DEVELOPER_TOKEN: "smapp_new",
  };

  it("adds the values to a new file", () => {
    expect(withManagedDevValues("", values, [])).toBe(
      "# SourceMedium local development (pnpm signin)\nSM_HOSTING=managed-dev\nSM_DATA_API_URL=https://urchin.example.test/api/app-data/v1\nSM_DEVELOPER_TOKEN=smapp_new\n",
    );
  });

  it("replaces an old token in place, keeps other settings and turns off self-hosted ones", () => {
    const before = "# mine\nMY_FLAG=1\nSM_DEVELOPER_TOKEN=smapp_old\nAPP_BASIC_AUTH=user:pass\n";
    expect(withManagedDevValues(before, values, ["APP_BASIC_AUTH"])).toBe(
      "# mine\nMY_FLAG=1\nSM_DEVELOPER_TOKEN=smapp_new\n# Turned off by pnpm signin (self-hosted setting): APP_BASIC_AUTH=user:pass\n\n" +
        "# SourceMedium local development (pnpm signin)\nSM_HOSTING=managed-dev\nSM_DATA_API_URL=https://urchin.example.test/api/app-data/v1\n",
    );
  });
});
