/**
 * Early challenges, so a browser shows its sign-in prompt before any page
 * renders. This is a convenience, not the guard: requireViewer() re-checks
 * every data read. Runs in the standard (edge) middleware runtime, the one
 * both Cloudflare's OpenNext adapter and Vercel support.
 *
 * Public without a guard: built static assets, the app icon, and /healthz.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { basicChallengeHeaders } from "@/lib/auth/basic";
import { readConfig } from "@/lib/config/env.server";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { assertStoreAccess, StoreAccessError } from "@/lib/auth/store-access";
import { isLoopbackRequest } from "@/lib/auth/loopback";
import { readSourceMediumViewer } from "@/lib/auth/sourcemedium-viewer";

export async function middleware(request: NextRequest) {
  const config = readConfig();
  // A configuration error is a 503 that names each problem (never a value), so
  // monitors and deploy checks see it. Pages render the same list as a backstop.
  if (config.status === "error") {
    const problems = config.problems.map((problem) => `- ${problem.message}`).join("\n");
    const owner =
      "The app owner can fix this in the host's variables; docs/connect.md in the app's repository explains each one.";
    return new NextResponse(`This app's configuration needs attention:\n${problems}\n${owner}\n`, {
      status: 503,
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (config.mode === "managed") {
    // Hosting: SourceMedium's gateway signed the viewer in and set X-SM-Viewer.
    // There is no guard of the app's own to run; requireViewer() reads it again.
    if (readSourceMediumViewer(request.headers)) return NextResponse.next();
    return new NextResponse("This app opens only through SourceMedium.\n", {
      status: 403,
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (config.mode === "managed-dev" && !isLoopbackRequest(request.headers)) {
    return new NextResponse(
      "Managed development serves only this computer: open it at http://127.0.0.1:3000. The developer token authorizes your development session, not a public app.\n",
      {
        status: 403,
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  const result = await authenticateRequest(config.guard, request.headers);
  if (result.ok) {
    try {
      for (const storeId of request.nextUrl.searchParams.getAll("store")) assertStoreAccess(config.storeId, storeId);
    } catch (error) {
      if (!(error instanceof StoreAccessError)) throw error;
      return new NextResponse(`${error.message}\n`, {
        status: 403,
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
    return NextResponse.next();
  }

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
  matcher: ["/((?!_next/static/|favicon\\.ico$|icon\\.svg$|healthz$).*)"],
};
