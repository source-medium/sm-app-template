/**
 * The shared-password guard: only the exact credential in a
 * well-formed, bounded header passes; the challenge carries no data.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_AUTHORIZATION_HEADER_LENGTH,
  basicChallengeHeaders,
  constantTimeEqual,
  verifyBasicAuthorization,
} from "@/lib/auth/basic";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { TEST_PASSWORD } from "../helpers/service-account";

const expected = { username: "viewer", password: TEST_PASSWORD };
const header = (value: string) => `Basic ${btoa(value)}`;

describe("Basic guard", () => {
  it("accepts exactly the configured credential", async () => {
    expect(await verifyBasicAuthorization(header(`viewer:${TEST_PASSWORD}`), expected)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["a wrong password", header("viewer:A1b2C3d4E5f6G7h8I9j0K1l2MX")],
    ["a wrong username", header(`admin:${TEST_PASSWORD}`)],
    ["the password with a suffix", header(`viewer:${TEST_PASSWORD}x`)],
    ["a missing colon", header(`viewer${TEST_PASSWORD}`)],
    ["a bare scheme", "Basic"],
    ["a scheme with a space only", "Basic "],
    ["invalid base64", "Basic !!!not-base64!!!"],
    ["a different scheme", `Bearer ${btoa(`viewer:${TEST_PASSWORD}`)}`],
    ["lowercase scheme with trailing data", `basic ${btoa(`viewer:${TEST_PASSWORD}`)} extra`],
    ["bytes that are not UTF-8", `Basic ${btoa("\xff\xfe:\xff")}`],
    ["an oversized header", header(`viewer:${TEST_PASSWORD}${"x".repeat(MAX_AUTHORIZATION_HEADER_LENGTH)}`)],
  ])("rejects %s", async (_label, value) => {
    expect(await verifyBasicAuthorization(value, expected)).toBe(false);
  });

  it("compares digests in constant time over every byte", () => {
    const a = new Uint8Array(32).fill(7);
    const b = new Uint8Array(32).fill(7);
    expect(constantTimeEqual(a, b)).toBe(true);
    b[31] = 8;
    expect(constantTimeEqual(a, b)).toBe(false);
    b[31] = 7;
    b[0] = 8;
    expect(constantTimeEqual(a, b)).toBe(false);
    expect(constantTimeEqual(a, new Uint8Array(31))).toBe(false);
  });

  it("challenges with a fixed realm and no data", () => {
    const headers = basicChallengeHeaders();
    expect(headers["WWW-Authenticate"]).toBe('Basic realm="SourceMedium app", charset="UTF-8"');
    expect(headers["Cache-Control"]).toBe("private, no-store");
    expect(JSON.stringify(headers)).not.toContain(TEST_PASSWORD);
  });

  it("authenticateRequest maps the guard decision for middleware and requireViewer", async () => {
    const guard = { kind: "basic" as const, ...expected };
    const ok = await authenticateRequest(guard, new Headers({ authorization: header(`viewer:${TEST_PASSWORD}`) }));
    expect(ok).toEqual({ ok: true, viewer: { kind: "shared-password" } });
    expect(await authenticateRequest(guard, new Headers())).toEqual({ ok: false, guard: "basic", reason: "missing" });
    expect(await authenticateRequest(guard, new Headers({ authorization: header("viewer:nope") }))).toEqual({
      ok: false,
      guard: "basic",
      reason: "invalid",
    });
    // A browser-supplied identity header is never a viewer.
    const spoofed = new Headers({ "cf-access-authenticated-user-email": "ceo@example.com" });
    expect((await authenticateRequest(guard, spoofed)).ok).toBe(false);
  });

  it("with no guard configured, the viewer is public (sample mode only; live requires a guard)", async () => {
    expect(await authenticateRequest(null, new Headers())).toEqual({ ok: true, viewer: { kind: "public" } });
  });
});
