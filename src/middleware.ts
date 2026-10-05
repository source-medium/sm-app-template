/**
 * Early challenges, so a browser shows its sign-in prompt before any page
 * renders. This is a convenience, not the guard: requireViewer() re-checks
 * every data read. Runs in the standard (edge) middleware runtime, the one
 * both Cloudflare's OpenNext adapter and Vercel support.
 *
 * Public without a guard: built static assets, the favicon, and /healthz.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { basicChallengeHeaders } from "@/lib/auth/basic";
import { readConfig } from "@/lib/config/env.server";
import { SECURITY_HEADERS } from "@/lib/security-headers";

export async function middleware(request: NextRequest) {
  const config = readConfig();
  // A configuration error is a 503 that names each problem (never a value), so
  // monitors and deploy checks see it. Pages render the same list as a backstop.
  if (config.status === "error") {
    const problems = config.problems.map((problem) => `- ${problem.message}`).join("\n");
    return new NextResponse(`This app's configuration needs attention:\n${problems}\nSee docs/connect.md.\n`, {
      status: 503,
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const result = await authenticateRequest(config.guard, request.headers);
  if (result.ok) return NextResponse.next();

  if (result.guard === "basic") {
    return new NextResponse("Sign in to view this app.\n", {
      status: 401,
      headers: { ...SECURITY_HEADERS, ...basicChallengeHeaders() },
    });
  }
  return new NextResponse("This app is protected by Cloudflare Access. Open it through your Access sign-in.\n", {
    status: 403,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static/|favicon\\.ico$|healthz$).*)"],
};
