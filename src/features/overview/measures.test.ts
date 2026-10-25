import { describe, expect, it } from "vitest";
import { formatCount, formatMeasure, formatMoney, formatMultiple } from "@/lib/format";
import { ratio, decimalToNumber } from "@/lib/data/decimal";
import { presentOverviewMeasures } from "./measures";

const measures = {
  netRevenue: "60.06",
  orders: 8,
  sessions: 22n,
  adSpend: "4.43",
};

describe("overview measure presentation", () => {
  const presented = presentOverviewMeasures(measures, null);
  const revenue = decimalToNumber(measures.netRevenue);
  const spend = decimalToNumber(measures.adSpend);

  it("formats the six shared measures once", () => {
    expect(presented.revenue).toMatchObject({
      display: formatMoney(measures.netRevenue),
      sort: revenue,
      amount: measures.netRevenue,
      better: "higher",
    });
    expect(presented.orders).toMatchObject({
      display: formatMeasure(measures.orders),
      sort: measures.orders,
      amount: measures.orders,
      better: "higher",
    });
    expect(presented.average).toMatchObject({
      display: formatMoney(ratio(revenue, measures.orders)),
      sort: ratio(revenue, measures.orders),
      better: "neutral",
    });
    expect(presented.spend.better).toBe("neutral");
    expect(presented.spend.display).toBe(formatMoney(measures.adSpend));
    expect(presented.mer).toMatchObject({
      display: formatMultiple(ratio(revenue, spend)),
      sort: ratio(revenue, spend),
      better: "higher",
    });
    expect(presented.sessions).toMatchObject({
      display: formatCount(measures.sessions),
      sort: 22,
      amount: measures.sessions,
      better: "higher",
    });
  });

  it("sorts an unsafe session count as missing and formats an empty period as empty", () => {
    const huge = 9_007_199_254_740_993n;
    const presentedHuge = presentOverviewMeasures({ ...measures, sessions: huge }, null);
    expect(presentedHuge.sessions.sort).toBeNull();
    expect(presentedHuge.sessions.display).toBe(formatCount(huge));
    expect(presentOverviewMeasures(null, null).revenue).toMatchObject({
      display: formatMoney(null),
      sort: null,
      amount: null,
    });
  });
});
