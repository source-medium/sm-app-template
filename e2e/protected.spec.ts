import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { PASSWORD } from "../playwright.config";

const home = appConfig.nav[0]?.href ?? "/";

test.describe("protected sample (shared password)", () => {
  test("documents, RSC and prefetch requests, dotted paths, and actions are challenged without credentials", async ({
    playwright,
    baseURL,
  }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    for (const [path, headers] of [
      [home, {}],
      [`${home}?_rsc=1`, { RSC: "1" }],
      [home, { RSC: "1", "Next-Router-Prefetch": "1" }],
      ["/robots.txt", {}],
      ["/paid-marketing/export", {}],
      ["/overview/export", {}],
      ["/.well-known/anything", {}],
      ["/%5Fnext/static/x", {}],
      ["/HEALTHZ", {}],
      ["/overview;x", {}],
      ["/sample-creatives/creative-01.svg", {}],
      [home, { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" }],
      [
        home,
        { "x-middleware-subrequest": "src/middleware:src/middleware:src/middleware:src/middleware:src/middleware" },
      ],
    ] as const) {
      const response = await anonymous.get(path, { headers });
      expect(response.status(), path).toBe(401);
      expect(response.headers()["www-authenticate"]).toContain("Basic");
      expect(await response.text()).not.toContain("Sample Store");
    }
    expect((await anonymous.post(home, { headers: { "Next-Action": "x" } })).status()).toBe(401);
    expect((await anonymous.get("/healthz")).status()).toBe(200);
    await anonymous.dispose();
  });

  test("a wrong password is refused", async ({ playwright, baseURL }) => {
    const wrong = await playwright.request.newContext({
      baseURL,
      httpCredentials: { username: "viewer", password: `${PASSWORD}x` },
    });
    expect((await wrong.get(home)).status()).toBe(401);
    await wrong.dispose();
  });

  test("the right password opens the app", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, httpCredentials: { username: "viewer", password: PASSWORD } });
    const page = await context.newPage();
    await page.goto(home);
    await expect(page.getByTestId("mode-chip")).toHaveText("Sample data");
    const next = appConfig.nav.at(-1);
    await page.getByRole("link", { name: next?.label ?? "" }).click();
    await expect(page).toHaveURL(new RegExp(next?.href ?? ""));
    await context.close();
  });
});
