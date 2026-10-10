/**
 * Live mode in a unit test: a complete configuration with a generated key,
 * an authenticated request, and the fake BigQuery standing in for Google.
 * Exercises requireViewer, the token exchange, the REST client, and the
 * decoders exactly as a deployed app does.
 */
import { vi } from "vitest";
import { createFakeBigQuery, JOB, type FakeBigQueryScript, type FakeCall } from "../fake-bigquery/fake-bigquery";
import { liveEnv, makeServiceAccountKey, TEST_PASSWORD } from "./service-account";

export const requestHeaders = { current: new Headers() };

export async function goLive(script: FakeBigQueryScript) {
  const key = await makeServiceAccountKey("sm-customer-apps-test", Math.random().toString(16).slice(2, 10));
  for (const [name, value] of Object.entries(liveEnv(key))) vi.stubEnv(name, value ?? "");
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  const fake = createFakeBigQuery(script);
  vi.stubGlobal("fetch", fake.fetch);
  return fake;
}

/** A jobs.query response carrying `rows` (objects) in BigQuery's f/v wire format. */
export function rowsResponse(
  fields: { name: string; type: string }[],
  rows: Record<string, string | null>[],
  extra: Record<string, unknown> = {},
) {
  return Response.json({
    jobReference: JOB,
    jobComplete: true,
    schema: { fields: fields.map((field) => ({ ...field, mode: "NULLABLE" })) },
    rows: rows.map((row) => ({ f: fields.map((field) => ({ v: row[field.name] ?? null })) })),
    totalBytesBilled: "1048576",
    ...extra,
  });
}

const ROSTER_FIELDS = ["sm_store_id", "store_name", "brand_name", "store_timezone"].map((name) => ({
  name,
  type: "STRING",
}));

/**
 * Answers the store list with `storeIds`, each in `timeZone`, and every other
 * query with `submit`. Pages and exports read the store's time zone before
 * their dates, unless this server already knows it.
 */
export function withStores(
  submit: NonNullable<FakeBigQueryScript["submit"]>,
  storeIds = ["store-1"],
  timeZone = "America/New_York",
): NonNullable<FakeBigQueryScript["submit"]> {
  return (call, signal) =>
    isStoreList(call)
      ? rowsResponse(
          ROSTER_FIELDS,
          storeIds.map((id) => ({ sm_store_id: id, store_name: null, brand_name: null, store_timezone: timeZone })),
        )
      : submit(call, signal);
}

export const isStoreList = (call: FakeCall) =>
  (call.body as { labels?: Record<string, string> }).labels?.sm_query === "store_roster";
