import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentPrompt } from "@/components/shell/agent-prompt";
import { KpiCard } from "@/components/patterns/kpi-card";
import type { AgentReportContext } from "@/lib/agent-prompt";

const report: AgentReportContext = {
  pathname: "/overview",
  title: "Overview",
  currency: "USD",
  filters: { store: "sample-store-a", from: "2026-09-01", to: "2026-09-07" },
};

function Page({ context = report }: { context?: AgentReportContext }) {
  return (
    <>
      <main>
        <header data-agent-page={JSON.stringify(context)}>
          <h1>{context.title}</h1>
        </header>
        <KpiCard label="Net revenue" value="ROW_VALUE_SENTINEL" period="September" />
        <KpiCard label="Net revenue" value="OTHER_ROW_SENTINEL" period="Previous" />
        <h3>UNDECLARED_ROW_HEADING</h3>
      </main>
      <AgentPrompt mode="sample" build="abc123" />
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

it("uses declared applied filters, excludes arbitrary URL/row text, and targets a specific component", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  window.history.replaceState(
    null,
    "",
    "/overview?store=sample-store-a&store=sample-store-b&access_token=TOKEN_SENTINEL&q=SEARCH_SENTINEL",
  );
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  const secondTarget = screen.getByRole("option", { name: "Net revenue (KPI), occurrence 2" }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Target"), { target: { value: secondTarget.value } });
  fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "check" } });
  fireEvent.change(screen.getByLabelText("Describe it"), { target: { value: "Net revenue looks too high." } });
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain('Target: "Net revenue (KPI), occurrence 2"');
  expect(prompt).toContain('Component: "KpiCard"');
  expect(prompt).toContain('store="sample-store-a"');
  for (const excluded of [
    "sample-store-b",
    "TOKEN_SENTINEL",
    "SEARCH_SENTINEL",
    "ROW_VALUE_SENTINEL",
    "OTHER_ROW_SENTINEL",
    "UNDECLARED_ROW_HEADING",
  ])
    expect(prompt).not.toContain(excluded);
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.getByText("Prompt copied.")).toBeInTheDocument());
  expect(writeText).toHaveBeenCalledWith(prompt);
  fireEvent.change(screen.getByLabelText("Describe it"), { target: { value: "Updated request" } });
  expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
});

it("keeps missing report context honest and provides manual copying on clipboard failure", async () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  window.history.replaceState(null, "", "/custom?token=TOKEN_SENTINEL");
  render(<AgentPrompt mode="live" build="abc123" />);
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.getByText("Could not copy. Select the prompt above and copy it.")).toBeVisible());
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain("Report context is unavailable");
  expect(prompt).not.toContain("TOKEN_SENTINEL");
});

it("refreshes context on reopening and drops a previous page's request and target", async () => {
  const view = render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  const option = screen.getByRole("option", { name: "Net revenue (KPI), occurrence 2" }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Target"), { target: { value: option.value } });
  fireEvent.change(screen.getByLabelText("Describe it"), { target: { value: "Old page request" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  view.rerender(
    <Page context={{ ...report, pathname: "/orders", title: "Orders", filters: { store: "sample-store-b" } }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  expect(screen.getByLabelText("Describe it")).toHaveValue("");
  expect(screen.getByLabelText("Target")).toHaveValue("");
  expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain('store="sample-store-b"');
});
