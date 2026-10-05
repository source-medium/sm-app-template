/**
 * Liveness only: answers with the build identifier and touches nothing else.
 * It is not readiness; `pnpm diagnose` checks the warehouse.
 */
import { buildId } from "@/lib/config/env.server";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: buildId() }, { headers: { "Cache-Control": "no-store" } });
}
