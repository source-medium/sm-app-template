/**
 * The Worker entry (`main` in wrangler.jsonc): OpenNext's handler, with byte
 * ranges answered for files (src/lib/byte-ranges.ts). Every request reaches
 * OpenNext first, so the viewer guard still decides who gets a public/ file;
 * this only shapes a 200 it already allowed.
 *
 * Wrangler bundles this file as worker.js, the entry SourceMedium's hosting
 * deploys; keep the name.
 */
// @ts-expect-error -- `pnpm build:cloudflare` generates this, without types.
import openNext from "./.open-next/worker.js";
import { withByteRanges } from "./src/lib/byte-ranges";

const handler = openNext as { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    return withByteRanges(request, await handler.fetch(request, env, ctx));
  },
};
