/**
 * The Cloudflare Access guard, against a test key set
 * served by a fake fetch: wrong issuer, audience, algorithm, time window,
 * and an unavailable key set all fail closed; key rotation is followed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey as JoseKey, type JWK } from "jose";
import { createAccessVerifier } from "@/lib/auth/cloudflare-access";

const TEAM = "acme.cloudflareaccess.com";
const ISSUER = `https://${TEAM}`;
const AUDIENCE = "b".repeat(64);
const CERTS = `${ISSUER}/cdn-cgi/access/certs`;
const NOW = new Date("2026-10-05T12:00:00Z");
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

let first: { privateKey: JoseKey; jwk: JWK };
let second: { privateKey: JoseKey; jwk: JWK };

async function keyPair(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" } };
}

/** A token with Access's claims; `claims` overrides any of them, and `undefined` removes one. */
function sign(key: { privateKey: JoseKey; jwk: JWK }, claims: Record<string, unknown> = {}, at = NOW) {
  const merged = {
    iss: ISSUER,
    aud: AUDIENCE,
    iat: seconds(at),
    exp: seconds(at) + 3600,
    email: "viewer@example.com",
    ...claims,
  };
  const payload = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
  return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: key.jwk.kid ?? "" }).sign(key.privateKey);
}

/** A key-set endpoint whose contents a test can change, counting its fetches. */
function jwksServer(initial: JWK[]) {
  const state = { keys: initial, fetches: 0, down: false };
  const fetchImpl: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== CERTS) throw new Error(`unexpected fetch ${url}`);
    state.fetches += 1;
    if (state.down) return new Response("unavailable", { status: 503 });
    return Response.json({ keys: state.keys });
  };
  return { state, fetch: fetchImpl };
}

beforeAll(async () => {
  first = await keyPair("key-1");
  second = await keyPair("key-2");
});

describe("Cloudflare Access guard", () => {
  it("accepts a valid token and returns the verified email", async () => {
    const server = jwksServer([first.jwk]);
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: server.fetch, currentDate: NOW },
    );
    expect(await verify(await sign(first))).toEqual({ ok: true, email: "viewer@example.com" });
    expect(await verify(await sign(first))).toEqual({ ok: true, email: "viewer@example.com" });
    expect(server.state.fetches).toBe(1);
  });

  it("rejects a missing token", async () => {
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: jwksServer([first.jwk]).fetch },
    );
    expect(await verify(null)).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["expired", { exp: seconds(NOW) - 60 }],
    ["not yet valid", { nbf: seconds(NOW) + 300 }],
    ["from another issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["for another audience", { aud: "c".repeat(64) }],
    ["without an email", { email: undefined }],
  ])("rejects a token that is %s", async (_label, claims) => {
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: jwksServer([first.jwk]).fetch, currentDate: NOW },
    );
    expect(await verify(await sign(first, claims))).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token signed with another algorithm", async () => {
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: jwksServer([first.jwk]).fetch, currentDate: NOW },
    );
    const hs256 = await new SignJWT({ email: "viewer@example.com" })
      .setProtectedHeader({ alg: "HS256", kid: "key-1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(seconds(NOW))
      .setExpirationTime(seconds(NOW) + 3600)
      .sign(new TextEncoder().encode("a-shared-secret-anyone-could-guess"));
    expect(await verify(hs256)).toEqual({ ok: false, reason: "invalid" });
    const unsigned = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ email: "x" }))}.`;
    expect((await verify(unsigned)).ok).toBe(false);
  });

  it("rejects a token signed by a key outside the key set", async () => {
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: jwksServer([first.jwk]).fetch, currentDate: NOW },
    );
    expect(await verify(await sign(second))).toEqual({ ok: false, reason: "invalid" });
  });

  it("fails closed when the key set is unavailable", async () => {
    const server = jwksServer([first.jwk]);
    server.state.down = true;
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: server.fetch, currentDate: NOW },
    );
    expect(await verify(await sign(first))).toEqual({ ok: false, reason: "keys_unavailable" });

    const throwing = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      {
        fetch: async () => {
          throw new TypeError("network down");
        },
        currentDate: NOW,
      },
    );
    expect(await throwing(await sign(first))).toEqual({ ok: false, reason: "keys_unavailable" });
  });

  it("follows key rotation: an unknown key id refetches the key set", async () => {
    const server = jwksServer([first.jwk]);
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: server.fetch, currentDate: NOW, cooldownMs: 0 },
    );
    expect((await verify(await sign(first))).ok).toBe(true);
    server.state.keys = [first.jwk, second.jwk];
    expect(await verify(await sign(second))).toEqual({ ok: true, email: "viewer@example.com" });
    expect(server.state.fetches).toBe(2);
  });

  it("bounds the token size", async () => {
    const verify = createAccessVerifier(
      { teamDomain: TEAM, audience: AUDIENCE },
      { fetch: jwksServer([first.jwk]).fetch },
    );
    expect(await verify("x".repeat(9000))).toEqual({ ok: false, reason: "invalid" });
  });
});
