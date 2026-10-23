/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * The viewer of an app SourceMedium hosts (docs/managed.md). SourceMedium's
 * gateway is the only way into a hosted app: it signs the person in, checks
 * their workspace access, removes any `X-SM-*` header the browser sent, and
 * sets `X-SM-Viewer` (base64url JSON, contracts/managed-app-v1/
 * viewer-header.schema.json). The header carries identity for display only,
 * never a credential: the data API rechecks the viewer on every query
 * through the gateway's outbound Worker, whatever this code does.
 */
import { z } from "zod";

export const VIEWER_HEADER = "x-sm-viewer";

const viewerHeader = z
  .object({
    contract_version: z.literal(1),
    kind: z.enum(["member", "agency"]),
    user_id: z.uuid(),
    email: z.string().max(320).nullable(),
    name: z.string().max(200).nullable(),
    organization_id: z.uuid(),
  })
  .strict();

export type SourceMediumViewer = {
  kind: "sourcemedium";
  /** A direct workspace member, or an agency with workspace-wide access. */
  access: "member" | "agency";
  userId: string;
  email: string | null;
  name: string | null;
  organizationId: string;
};

const MAX_HEADER_LENGTH = 2048;

/** The gateway's viewer, or null when the header is missing or malformed. */
export function readSourceMediumViewer(headers: Headers): SourceMediumViewer | null {
  const raw = headers.get(VIEWER_HEADER);
  if (!raw || raw.length > MAX_HEADER_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let decoded: unknown;
  try {
    const binary = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
  } catch {
    return null;
  }
  const parsed = viewerHeader.safeParse(decoded);
  if (!parsed.success) return null;
  return {
    kind: "sourcemedium",
    access: parsed.data.kind,
    userId: parsed.data.user_id,
    email: parsed.data.email,
    name: parsed.data.name,
    organizationId: parsed.data.organization_id,
  };
}
