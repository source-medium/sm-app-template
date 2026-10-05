/**
 * Test identities. Keys are generated per run with WebCrypto, so the same
 * helper works in Node and workerd and no real key ever exists in the repo.
 */

export const TEST_JOB_PROJECT = "sm-customer-apps-test";
export const TEST_APP_ID = "0b6f7a52-3c4e-4d1f-9a2b-1c2d3e4f5a6b";
export const TEST_PASSWORD = "A1b2C3d4E5f6G7h8I9j0K1l2M3";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type TestKey = { base64: string; json: Record<string, string>; publicKey: CryptoKey };

export async function makeServiceAccountKey(project = TEST_JOB_PROJECT, marker = "test"): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = toBase64(pkcs8).replace(/(.{64})/g, "$1\n");
  const json = {
    type: "service_account",
    project_id: project,
    private_key_id: "0123456789abcdef0123456789abcdef01234567",
    private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    client_email: `app-${marker}0123456789@${project}.iam.gserviceaccount.com`,
    client_id: "123456789012345678901",
    token_uri: "https://attacker.example/token",
  };
  return { base64: toBase64(new TextEncoder().encode(JSON.stringify(json))), json, publicKey: pair.publicKey };
}

export function liveEnv(
  key: TestKey,
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    SM_APPLICATION_ID: TEST_APP_ID,
    SM_APP_KEY: key.base64,
    BIGQUERY_JOB_PROJECT_ID: TEST_JOB_PROJECT,
    BIGQUERY_LOCATION: "US",
    SM_DATA_PROJECT_ID: "sm-demotenant",
    SM_TRANSFORMED_DATASET_ID: "sm_transformed_v2",
    SM_METADATA_DATASET_ID: "sm_metadata",
    APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}`,
    ...overrides,
  };
}
