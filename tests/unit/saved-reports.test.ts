import { expect, it } from "vitest";
import { parseSavedReports } from "@/lib/saved-reports";

it("keeps valid saved filters while discarding corrupt entries and unsafe or removed routes", () => {
  const good = { id: "1", name: "  Weekly sales  ", href: "/report?range=last-7-days&store=a#old-anchor" };
  const entries = [
    null,
    { ...good, id: "bad", href: "javascript:alert(1)" },
    { ...good, id: "external", href: "//example.com/report" },
    { ...good, id: "malformed", href: "/\\[invalid" },
    { ...good, id: "removed", href: "/removed-report" },
    { ...good, id: "name", name: " " },
    good,
    { ...good, name: "Duplicate id" },
    { id: "2", name: "Another", href: "/report?metric=units" },
  ];
  expect(parseSavedReports(JSON.stringify(entries), ["/report"])).toEqual([
    { id: "1", name: "Weekly sales", href: "/report?range=last-7-days&store=a" },
    { id: "2", name: "Another", href: "/report?metric=units" },
  ]);
  for (const raw of [null, "not JSON", "{}", "null"]) expect(parseSavedReports(raw, ["/report"])).toEqual([]);
});
