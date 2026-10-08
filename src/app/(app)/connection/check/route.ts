import { requireViewer } from "@/lib/auth/require-viewer";
import { SAMPLE_CONNECTION_REPORT } from "@/lib/data/connection-report";

export async function POST(request: Request) {
  const access = await requireViewer();
  const headers = { "Cache-Control": "private, no-store" };
  // next start canonicalizes request.url to localhost; Host retains the
  // authority the browser actually addressed. Workers preserves it too.
  const target = new URL(request.url);
  target.host = request.headers.get("host") ?? target.host;
  if (request.headers.get("origin") !== target.origin) {
    return Response.json({ error: "Open Connection in this app to run the check." }, { status: 403, headers });
  }
  const report =
    access.mode === "sample" ? SAMPLE_CONNECTION_REPORT : await access.warehouse.checkConnection(request.signal);
  return Response.json(report, { headers });
}
