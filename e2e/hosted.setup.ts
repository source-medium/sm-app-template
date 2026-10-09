import { request, type FullConfig } from "@playwright/test";

/** Gate the existing live suite before querying reports. Keep failures free of response bodies and credentials. */
export async function verifyHostedApp(
  baseURL: string,
  commit: string,
  credentials: { username: string; password: string },
) {
  const anonymous = await request.newContext({ baseURL, timeout: 45_000 });
  const signedIn = await request.newContext({
    baseURL,
    timeout: 45_000,
    httpCredentials: { ...credentials, origin: baseURL },
  });
  let stage = "build identity";
  try {
    const health = await anonymous.get("/healthz", { maxRedirects: 0 });
    if (health.status() !== 200 || (await health.json()).build !== commit.slice(0, 12)) throw new Error();

    stage = "anonymous viewer guard";
    for (const path of ["/", "/connection", "/robots.txt", "/data-dictionary"]) {
      const response = await anonymous.get(path, { maxRedirects: 0 });
      if (response.status() !== 401 || !response.headers()["www-authenticate"]?.startsWith("Basic")) throw new Error();
    }
    const rsc = await anonymous.get("/?_rsc=1", {
      headers: { RSC: "1", "Next-Router-Prefetch": "1" },
      maxRedirects: 0,
    });
    if (rsc.status() !== 401 || (await anonymous.post("/connection/check", { maxRedirects: 0 })).status() !== 401)
      throw new Error();

    stage = "live Connection check (use its safe report for details)";
    const response = await signedIn.post("/connection/check", { headers: { Origin: baseURL }, maxRedirects: 0 });
    if (response.status() !== 200) throw new Error();
    const report = await response.json();
    if (
      report.mode !== "live" ||
      !Array.isArray(report.checks) ||
      !report.checks.length ||
      !report.checks.some((check: { status: string }) => check.status === "pass") ||
      !report.checks.every((check: { status: string }) => ["pass", "warning"].includes(check.status))
    )
      throw new Error();
    console.log(
      `Hosted build and guard verified; live Connection passed (${report.checks.filter((check: { status: string }) => check.status === "warning").length} warnings).`,
    );
  } catch {
    throw new Error(
      `Hosted verification failed: ${stage}. No report tests were run. See docs/cloud.md#verify-a-hosted-build.`,
    );
  } finally {
    await Promise.all([anonymous.dispose(), signedIn.dispose()]);
  }
}

export default async function setup(config: FullConfig) {
  const { baseURL, httpCredentials } = config.projects[0]?.use ?? {};
  const commit = process.env.SM_EXPECTED_COMMIT;
  if (!baseURL || !httpCredentials || Array.isArray(httpCredentials) || !commit)
    throw new Error("Missing hosted test configuration.");
  await verifyHostedApp(baseURL, commit, httpCredentials);
}
