/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * The one viewer decision, shared by middleware (early challenges) and
 * requireViewer() (the guard every data read calls). A browser-supplied
 * identity header is never trusted on its own.
 */
import type { GuardConfig } from "@/lib/config/env.server";
import { verifyBasicAuthorization } from "./basic";
import { ACCESS_TOKEN_HEADER, accessVerifierFor } from "./cloudflare-access";

export type Viewer = { kind: "public" } | { kind: "shared-password" } | { kind: "access"; email: string };

export type AuthenticationResult =
  | { ok: true; viewer: Viewer }
  | { ok: false; guard: GuardConfig["kind"]; reason: "missing" | "invalid" | "keys_unavailable" };

export async function authenticateRequest(guard: GuardConfig | null, headers: Headers): Promise<AuthenticationResult> {
  if (!guard) return { ok: true, viewer: { kind: "public" } };

  if (guard.kind === "basic") {
    const authorization = headers.get("authorization");
    if (!authorization) return { ok: false, guard: "basic", reason: "missing" };
    const valid = await verifyBasicAuthorization(authorization, guard);
    return valid ? { ok: true, viewer: { kind: "shared-password" } } : { ok: false, guard: "basic", reason: "invalid" };
  }

  const result = await accessVerifierFor(guard)(headers.get(ACCESS_TOKEN_HEADER));
  return result.ok
    ? { ok: true, viewer: { kind: "access", email: result.email } }
    : { ok: false, guard: "access", reason: result.reason };
}
