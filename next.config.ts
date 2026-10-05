import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

// A non-secret build identifier for logs and /healthz. Hosts expose the commit.
const buildId =
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { SM_BUILD_ID: buildId.slice(0, 12) },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
