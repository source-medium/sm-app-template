import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseComparisonPlan } from "@/lib/comparison";
import type { CreativeSummary, CreativeSummaryGroup } from "./queries";
import { adRatios } from "@/lib/ad-totals";
import { CreativeSummaryView, launchOrder, newCreativeShare } from "./summary";

const range = { from: "2026-09-01", to: "2026-09-28" };
const group = (spend: string | null, revenue: number | null, extra: Partial<CreativeSummaryGroup> = {}) => ({
  spend,
  revenue,
  impressions: 1000n,
  clicks: 20n,
  conversions: 10,
  creatives: 3n,
  ...extra,
});
const launch = (week: string | null, spend: string | null) => ({ week, ...group(spend, 0) });

function summary(overrides: Partial<CreativeSummary> = {}): CreativeSummary {
  return {
    totals: { current: group("100", 300), baselines: [group("100", 200), group("50", 50)] },
    newCreatives: 1n,
    uncoveredSpend: null,
    coverage: null,
    formats: [],
    launches: [launch(null, "75"), launch("2026-09-14", "25")],
    ...overrides,
  };
}

describe("creative summary", () => {
  it("takes every ratio from a group's sums", () => {
    expect(adRatios(group("100", 250, { conversions: 4, clicks: 30n, impressions: 1200n }))).toEqual({
      roas: 2.5,
      cpo: 25,
      ctr: 0.025,
    });
    expect(adRatios(group(null, null, { conversions: null, clicks: null }))).toEqual({
      roas: null,
      cpo: null,
      ctr: null,
    });
  });

  it("orders launch weeks by date, then the creatives already running", () => {
    const rows = [launch("2026-09-21", "1"), launch(null, "9"), launch("2026-09-07", "3")];
    expect(launchOrder(rows).map((row) => row.week)).toEqual(["2026-09-07", "2026-09-21", null]);
  });

  it("shares spend on new creatives only when every launch group's spend is nonnegative", () => {
    expect(newCreativeShare(summary())).toBe(0.25);
    expect(newCreativeShare(summary({ launches: [launch(null, "-5"), launch("2026-09-14", "25")] }))).toBeNull();
    expect(
      newCreativeShare(summary({ totals: { current: group("0", 0), baselines: [group("0", 0), group("0", 0)] } })),
    ).toBeNull();
  });

  it("compares each KPI ratio with the same ratio of each comparison period's sums", () => {
    const plan = parseComparisonPlan({ compare: "previous", compare2: "year" }, range, "2026-10-01");
    const [first, second] = plan.slots;
    const coverage = {
      latest_date: range.to,
      previous_latest_date: first.range?.to ?? null,
      second_latest_date: second.range?.to ?? null,
    };
    render(
      <CreativeSummaryView
        summary={summary({ coverage })}
        plan={plan}
        range={range}
        format={null}
        params={{}}
        pathname="/creatives"
        currency="USD"
      />,
    );
    const roas = screen
      .getByText("Platform ROAS", { selector: '[data-slot="kpi-label"]' })
      .closest('[data-slot="card"]');
    if (!(roas instanceof HTMLElement)) throw new Error("Missing ROAS card");
    expect(within(roas).getByText("3.00x")).toBeVisible();
    // 3.00x against 2.00x, then against 1.00x.
    const changes = within(roas)
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("data-slot") === "kpi-delta");
    expect(changes.map((item) => item.textContent)).toEqual([`+50.00%vs ${first.short}`, `+200.00%vs ${second.short}`]);
    expect(screen.getByText("25% of spend")).toBeVisible();
  });
});
