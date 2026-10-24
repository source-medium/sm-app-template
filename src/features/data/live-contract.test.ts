import { expect, it, vi } from "vitest";
import { goLive } from "../../../tests/helpers/live";
it("guards both definitions loaders before reading a fixed-store catalog", async () => {
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getDefinitions } = await import("./queries");
  const { queryDefinitions } = await import("./bigquery");
  await expect(getDefinitions("other")).rejects.toThrow("This store is not available");
  await expect(queryDefinitions("other", ["obt_orders"])).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
