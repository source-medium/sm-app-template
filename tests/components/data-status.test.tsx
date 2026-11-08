import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DataStatus } from "@/components/shell/data-status";
import type { SourceEvidence } from "@/lib/data/evidence";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/report-metadata.server", () => ({ loadReportMetadata: load }));

function source(relation: string, overrides: Partial<SourceEvidence> = {}): SourceEvidence {
  return {
    dataset: "sm_transformed_v2",
    relation,
    scope: "store",
    metadata: "accessible",
    consistency: "consistent",
    observedDate: "2026-09-28",
    freshness: "unknown",
    completeness: "unknown",
    quality: "unknown",
    ...overrides,
  };
}
const live = (sources: SourceEvidence[], extra = {}) => ({
  mode: "live",
  sources,
  metrics: [],
  truncated: false,
  ...extra,
});
const status = async () =>
  render(
    (await DataStatus({ storeId: "a", sources: [{ relation: "orders", scope: "Orders" }], bindings: [] })) ?? <></>,
  );

beforeEach(() => load.mockReset());

it("shows nothing on sample data, where the mode chip and footer already say what the numbers are", async () => {
  load.mockResolvedValue({ mode: "sample" });
  const { container } = await status();
  expect(container).toBeEmptyDOMElement();
});

it("names one published date when every source agrees, and keeps table names behind the line", async () => {
  load.mockResolvedValue(live([source("rpt_a"), source("rpt_b")]));
  await status();
  expect(screen.getByText("Latest published date: Sep 28, 2026")).toBeVisible();
  const line = screen.getByText("Latest published date: Sep 28, 2026").closest("summary");
  expect(line).not.toHaveTextContent("rpt_a");
  // The evidence stays on the page, including what the date does not prove.
  expect(screen.getByRole("complementary", { name: "Data status" })).toHaveTextContent(
    "Pipeline freshness, period completeness and quality checks are not published.",
  );
  expect(screen.getByRole("complementary", { name: "Data status" })).toHaveTextContent("rpt_a");
  expect(screen.getByRole("complementary", { name: "Data status" })).toHaveTextContent(
    "It is not a successful load or completeness watermark.",
  );
});

it("never picks a date when the sources differ, conflict or publish none", async () => {
  load.mockResolvedValue(live([source("rpt_a"), source("rpt_b", { observedDate: "2026-09-20" })]));
  const first = await status();
  expect(screen.getByText("Published dates vary by source")).toBeVisible();
  first.unmount();
  load.mockResolvedValue(live([source("rpt_a", { consistency: "inconsistent" }), source("rpt_b")]));
  const second = await status();
  expect(screen.getByText("Sources disagree on their published dates")).toBeVisible();
  second.unmount();
  load.mockResolvedValue(live([source("rpt_a", { observedDate: null })]));
  await status();
  expect(screen.getByText("No published date for this store")).toBeVisible();
});

it("flags a partial metadata list", async () => {
  load.mockResolvedValue(live([source("rpt_a")], { truncated: true }));
  await status();
  expect(screen.getByRole("complementary", { name: "Data status" })).toHaveTextContent(
    "Partial metadata list. Missing dependencies are not passes.",
  );
});
