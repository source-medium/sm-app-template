import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionCheck } from "@/components/shell/connection-check";

afterEach(() => vi.unstubAllGlobals());

it("labels a connection result with the instance returned by that check", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        mode: "sample",
        checks: [],
        checkedAt: "Oct 22, 2026, 5:00:00 PM UTC",
        instance: { environment: "Branch preview", build: "checked-build", requireLive: true },
      }),
    ),
  );
  render(<ConnectionCheck mode="sample" />);
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await screen.findByText("Sample mode is ready.");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Instance: Branch preview; build checked-build; live required: yes.",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Checked at: Oct 22, 2026, 5:00:00 PM UTC");
});
