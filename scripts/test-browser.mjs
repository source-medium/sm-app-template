/** Run browser tests, supplying missing Linux libraries only inside Workers Builds. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
let temporary;
let browserEnv = process.env;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function checked(command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout || result.signal}`);
  return result;
}

try {
  if (process.platform === "linux" && process.env.WORKERS_CI_COMMIT_SHA) {
    try {
      const browser = await chromium.launch();
      await browser.close();
    } catch (error) {
      // Missing downloads and unrelated launch failures need their own fix.
      if (!/error while loading shared libraries:|Host system is missing dependencies/.test(String(error))) throw error;

      console.log("Preparing Chromium libraries in a temporary directory (no system install).");
      temporary = mkdtempSync(join(tmpdir(), "sm-browser-"));
      mkdirSync(join(temporary, "lists", "partial"), { recursive: true });
      const aptConfig = join(temporary, "apt.conf");
      writeFileSync(aptConfig, `Dir::State::lists ${JSON.stringify(join(temporary, "lists"))};\n`);
      const aptOptions = { cwd: temporary, env: { ...process.env, APT_CONFIG: aptConfig } };
      checked("apt-get", ["update"], aptOptions);
      // Let the locked Playwright version and apt resolve the OS package closure.
      // Its public dry-run command never installs packages or asks for root.
      const report = run(process.execPath, [cli, "install-deps", "--dry-run", "chromium"], aptOptions);
      const match = /^Missing system dependencies \((\d+)\):\n((?: {2}[a-z0-9][a-z0-9+.:_-]*\n?)+)$/.exec(
        report.stdout.trim(),
      );
      const packages = match?.[2].trim().split(/\s+/) ?? [];
      if (report.status !== 1 || packages.length !== Number(match?.[1]) || packages.length === 0)
        throw new Error(`Could not resolve Chromium libraries: ${report.stderr || report.stdout}`, { cause: error });
      checked("apt-get", ["download", ...packages], aptOptions);
      const prefix = join(temporary, "unpacked");
      for (const archive of readdirSync(temporary).filter((file) => file.endsWith(".deb")))
        checked("dpkg-deb", ["--extract", join(temporary, archive), prefix]);
      const architecture = { x64: "x86_64-linux-gnu", arm64: "aarch64-linux-gnu" }[process.arch];
      if (!architecture) throw new Error(`Unsupported Workers Builds architecture: ${process.arch}`, { cause: error });
      const libraryPath = ["usr/lib", "lib"].flatMap((dir) => [join(prefix, dir, architecture), join(prefix, dir)]);
      const fontsConfig = join(temporary, "fonts.conf");
      writeFileSync(
        fontsConfig,
        `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include>/etc/fonts/fonts.conf</include><dir>${prefix}/usr/share/fonts</dir></fontconfig>`,
      );
      browserEnv = {
        ...process.env,
        LD_LIBRARY_PATH: [...libraryPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
        FONTCONFIG_FILE: fontsConfig,
      };
      const browser = await chromium.launch({ env: browserEnv });
      await browser.close();
    }
  }
  // The environment is scoped to the browser test process; deployment
  // cannot accidentally inherit these temporary libraries.
  const result = run(process.execPath, [cli, "test", ...process.argv.slice(2)], {
    env: browserEnv,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
