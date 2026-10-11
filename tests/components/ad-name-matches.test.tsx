import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { AdNameMatches } from "@/components/patterns/ad-name-matches";

it("highlights original character positions when case folding changes the string length", () => {
  const text = "İ | [retargeting] | 🎨 20%_off";
  const { container } = render(
    <AdNameMatches
      data={{ rows: [{ campaign: text, ad_group: "İstanbul", ad: "a.b [x]" }], truncated: false }}
      rules={[
        { field: "campaign", operator: "contains", values: ["[RETARGETING]", "🎨", "20%_off"] },
        { field: "ad_group", operator: "starts_with", values: ["i\u0307s"] },
        { field: "ad", operator: "contains", values: [".", "[x]"] },
      ]}
    />,
  );
  expect(container.querySelector("tbody td")).toHaveTextContent(text);
  expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
    "[retargeting]",
    "🎨",
    "20%_off",
    "İs",
    ".",
    "[x]",
  ]);
});
