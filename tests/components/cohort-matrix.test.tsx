import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CohortMatrix, type CohortCell } from "@/components/patterns/cohort-matrix";

const value = (display: string, intensity: number | null): CohortCell => ({
  display,
  description: display,
  intensity,
  state: "value",
});
const immature: CohortCell = { display: "—", description: "Not yet elapsed", intensity: null, state: "immature" };

describe("CohortMatrix", () => {
  it("leaves cells without an intensity unshaded and shades the rest continuously by value", () => {
    render(
      <CohortMatrix
        caption="Monthly retention"
        columns={["Month 0", "Month 1", "Month 2"]}
        rows={[
          {
            id: "a",
            label: "Jan 2026",
            size: "100",
            cells: [value("100%", null), value("32%", 0.32), value("9%", 0.09)],
          },
          { id: "b", label: "Feb 2026", size: "90", cells: [value("100%", null), value("30%", 0.3), immature] },
        ]}
      />,
    );
    const cell = (name: string) => screen.getAllByRole("cell", { name: new RegExp(`^Jan 2026, ${name}:`) })[0];
    const shade = (name: string) => cell(name)?.getAttribute("data-shade");
    expect(shade("Month 0")).toBeNull();
    // The feature left Month 0 without an intensity; the highest of the rest takes the darkest shade.
    expect(shade("Month 1")).toBe("52");
    // The lowest populated age still gets a shade, so it stands apart from an empty cell.
    expect(shade("Month 2")).toBe("12");
    // Shades follow values: 30% sits between 9% and 32%, close to the top.
    expect(screen.getByRole("cell", { name: /^Feb 2026, Month 1:/ }).getAttribute("data-shade")).toBe("49");
    expect(screen.getByRole("cell", { name: /^Feb 2026, Month 2:/ }).getAttribute("data-shade")).toBeNull();
  });
});
