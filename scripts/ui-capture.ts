/**
 * Capture the UI review packet SourceMedium maintainers' sm-polish review reads:
 *
 *   pnpm ui-capture [--routes <id,...>] [--theme light|dark|all]
 *                   [--viewport desktop|mobile|all] --out <dir>
 *   pnpm ui-capture --list
 *
 * Builds the app, serves the build on sample data on a loopback port (every app
 * setting cleared, as the browser tests do, so no live warehouse is reachable),
 * and writes:
 *
 *   <out>/manifest.json                     v1: repo, sha, dirty, register, items
 *   <out>/rubric/PRODUCT.md, DESIGN.md       copied at capture time
 *   <out>/<route-id>/<viewport>-<theme>.png  a screenshot as tall as the page, cut at 4000px
 *
 * Routes are the views in app.config.ts `nav`, in order; a route's id is its path
 * without the slash. Overflow is data in the manifest, not a failure; only a view
 * that never shows its heading fails the run. The packet is staged beside <out>
 * and renamed into place, so a failed run leaves nothing at <out>.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { appConfig } from "../app.config";
import { sampleEnvironment } from "./lib/sample-env";
import { testPortOffset } from "./lib/test-ports";

const ROOT = resolve(import.meta.dirname, "..");
const RUBRIC = ["PRODUCT.md", "DESIGN.md"];
const THEMES = ["light", "dark"] as const;
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;
type Theme = (typeof THEMES)[number];
type Viewport = keyof typeof VIEWPORTS;
// The tallest a screenshot gets: every reviewer must decode it (one refused 390x7996).
const MAX_SCREENSHOT_HEIGHT = 4000;
const CLIPPED_LIMIT = 20;
const LOADING_SELECTOR = '[data-slot="skeleton"], [aria-busy="true"]';
// Beside the browser tests' sample (3105) and protected (3106) servers, moved by the same offset.
const PORT = 3107 + testPortOffset();
const ORIGIN = `http://127.0.0.1:${PORT}`;

const ROUTES = appConfig.nav.map((item, index) => ({ id: item.href.slice(1), path: item.href, priority: index + 1 }));

function usage(code: number): never {
  console.log(
    [
      "Usage: pnpm ui-capture [--routes <id,...>] [--theme light|dark|all]",
      "                       [--viewport desktop|mobile|all] --out <dir>",
      "       pnpm ui-capture --list",
    ].join("\n"),
  );
  process.exit(code);
}

function parseArgs(argv: string[]) {
  let routes = ROUTES;
  let themes: readonly Theme[] = THEMES;
  let viewports = Object.keys(VIEWPORTS) as Viewport[];
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith("--")) usage(1);
      return next;
    };
    if (arg === "--list") {
      for (const route of ROUTES) console.log(`${route.id}\t${route.path}`);
      process.exit(0);
    } else if (arg === "--routes") {
      const ids = value().split(",").filter(Boolean);
      const unknown = ids.filter((id) => !ROUTES.some((route) => route.id === id));
      if (unknown.length) {
        console.error(`Unknown route ${unknown.join(", ")}; pnpm ui-capture --list shows them.`);
        process.exit(1);
      }
      routes = ROUTES.filter((route) => ids.includes(route.id));
    } else if (arg === "--theme") {
      const theme = value();
      if (theme !== "all" && !THEMES.includes(theme as Theme)) usage(1);
      themes = theme === "all" ? THEMES : [theme as Theme];
    } else if (arg === "--viewport") {
      const viewport = value();
      if (viewport !== "all" && !(viewport in VIEWPORTS)) usage(1);
      viewports = viewport === "all" ? viewports : [viewport as Viewport];
    } else if (arg === "--out") {
      out = resolve(value());
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else {
      usage(1);
    }
  }
  if (!out) usage(1);
  return { routes, themes, viewports, out };
}

const git = (...args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout.trim();

/** The register PRODUCT.md declares under its Register heading. */
function register(): string {
  const value = /^## Register\s+(\w+)/m.exec(readFileSync(join(ROOT, "PRODUCT.md"), "utf8"))?.[1];
  if (value !== "product" && value !== "brand") throw new Error("PRODUCT.md must declare its register.");
  return value;
}

const sampleEnv = { ...process.env, ...sampleEnvironment };

function build(): void {
  const result = spawnSync("pnpm", ["exec", "next", "build"], { cwd: ROOT, env: sampleEnv, stdio: "inherit" });
  if (result.status !== 0) throw new Error("next build failed.");
}

async function serve(): Promise<ChildProcess> {
  const server = spawn("pnpm", ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    env: sampleEnv,
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`The sample server exited (${server.exitCode}); is port ${PORT} free?`);
    try {
      if ((await fetch(`${ORIGIN}/healthz`)).ok) return server;
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  stop(server);
  throw new Error(`The sample server did not answer on ${ORIGIN} within a minute.`);
}

function stop(server: ChildProcess): void {
  if (server.pid && server.exitCode === null) process.kill(-server.pid, "SIGTERM");
}

/** The visible h1 and the overflow probe, as urchin's review sweep reads them. */
function readProbes(page: Page) {
  return page.evaluate((limit) => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const describe = (el: Element) => {
      const classes = [...el.classList].slice(0, 3).join(".");
      const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60);
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${text ? ` "${text}"` : ""}`;
    };
    const h1 = [...document.querySelectorAll("h1")].find(shown) as HTMLElement | undefined;
    const root = document.documentElement;
    const clipped: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.clientWidth <= 1 || el.scrollWidth <= el.clientWidth + 1) continue;
      const style = getComputedStyle(el);
      // Scroll containers and deliberate truncation are not clipping; a clip or clip-path is the sr-only pattern.
      if (style.overflowX !== "hidden" && style.overflowX !== "clip") continue;
      if (style.textOverflow === "ellipsis") continue;
      if (style.getPropertyValue("-webkit-line-clamp") !== "none") continue;
      if (style.clip !== "auto" || style.clipPath !== "none") continue;
      if (!shown(el)) continue;
      clipped.push(describe(el));
      if (clipped.length >= limit) break;
    }
    return {
      h1: h1?.innerText.trim().replace(/\s+/g, " ") ?? "",
      overflow: { page: root.scrollWidth > root.clientWidth, clipped },
    };
  }, CLIPPED_LIMIT);
}

/**
 * A screen as tall as the page, so anything sized to the viewport (the sidebar)
 * renders as a tall monitor shows it, cut at MAX_SCREENSHOT_HEIGHT.
 */
async function screenshot(page: Page, file: string): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error("Each capture context sets a viewport.");
  const { width, height } = size;
  let shown = height;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = Math.min(MAX_SCREENSHOT_HEIGHT, await page.evaluate(() => document.documentElement.scrollHeight));
    if (next <= shown) break;
    shown = next;
    await page.setViewportSize({ width, height: shown });
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
}

async function capture(
  browser: Browser,
  route: (typeof ROUTES)[number],
  viewport: Viewport,
  theme: Theme,
  out: string,
) {
  const context = await browser.newContext({ ...VIEWPORTS[viewport], deviceScaleFactor: 1, colorScheme: theme });
  // tsx keeps function names with a __name helper, which page.evaluate carries into the page without its definition.
  await context.addInitScript("globalThis.__name = (target) => target;");
  try {
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${route.path}`, { waitUntil: "networkidle" });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
    // Streamed sections land after the heading; a loader still showing after this is captured as it is.
    await page
      .waitForFunction((selector) => !document.querySelector(selector), LOADING_SELECTOR, { timeout: 15_000 })
      .catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const probes = await readProbes(page);
    const file = `${route.id}/${viewport}-${theme}.png`;
    mkdirSync(join(out, route.id), { recursive: true });
    await screenshot(page, join(out, file));
    return { route_id: route.id, path: route.path, priority: route.priority, viewport, theme, file, ...probes };
  } finally {
    await context.close();
  }
}

async function main() {
  const { routes, themes, viewports, out } = parseArgs(process.argv.slice(2));
  if (existsSync(out)) throw new Error(`${out} already exists; choose a new directory for each capture.`);
  const staging = join(dirname(out), `.${basename(out)}.partial-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "rubric"), { recursive: true });
  for (const file of RUBRIC) copyFileSync(join(ROOT, file), join(staging, "rubric", file));
  const manifest = {
    v: 1,
    repo: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name as string,
    sha: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
    register: register(),
    items: [] as Awaited<ReturnType<typeof capture>>[],
  };

  try {
    build();
    const server = await serve();
    const browser = await chromium.launch();
    try {
      for (const route of routes)
        for (const viewport of viewports)
          for (const theme of themes) {
            const item = await capture(browser, route, viewport, theme, staging);
            manifest.items.push(item);
            console.log(`${item.file}${item.overflow.page ? "  (page overflows)" : ""}`);
          }
    } finally {
      await browser.close();
      stop(server);
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(dirname(out), { recursive: true });
  renameSync(staging, out);
  console.log(`Wrote ${manifest.items.length} screenshots to ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
