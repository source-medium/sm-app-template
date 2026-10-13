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
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  const secondTarget = screen.getByRole("option", { name: "Net revenue (KPI), occurrence 2" }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Target"), { target: { value: secondTarget.value } });
  fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "check" } });
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Net revenue looks too high." } });
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
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Updated request" } });
  expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
});

it("keeps missing report context honest and provides manual copying on clipboard failure", async () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  window.history.replaceState(null, "", "/custom?token=TOKEN_SENTINEL");
  render(<AgentPrompt mode="live" build="abc123" />);
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Make this clearer." } });
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.getByText("Could not copy. Select the prompt above and copy it.")).toBeVisible());
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain("Report context is unavailable");
  expect(prompt).not.toContain("TOKEN_SENTINEL");
});

it("refreshes context on reopening and drops a previous page's request and target", async () => {
  const view = render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  const option = screen.getByRole("option", { name: "Net revenue (KPI), occurrence 2" }) as HTMLOptionElement;
  fireEvent.change(screen.getByLabelText("Target"), { target: { value: option.value } });
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Old page request" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  view.rerender(
    <Page context={{ ...report, pathname: "/orders", title: "Orders", filters: { store: "sample-store-b" } }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  expect(screen.getByLabelText("Your request")).toHaveValue("");
  expect(screen.getByLabelText("Target")).toHaveValue("");
  expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain('store="sample-store-b"');
});

it("picks a repeated component without copying its row values and keeps the draft", async () => {
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Make this easier to read." } });
  fireEvent.click(screen.getByRole("button", { name: "Pick an element" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByText("OTHER_ROW_SENTINEL"));
  expect(screen.getByLabelText("Your request")).toHaveValue("Make this easier to read.");
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain('Target: "Net revenue (KPI), occurrence 2"');
  expect(prompt).not.toContain("OTHER_ROW_SENTINEL");
  fireEvent.click(screen.getByRole("button", { name: "Pick an element" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByLabelText("Your request")).toHaveValue("Make this easier to read.");
  expect(screen.getByLabelText("Prompt")).toHaveValue(prompt);
});

it("asks what is needed before the request, defaults to changing the UI, and blocks empty copying", async () => {
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  expect(screen.getByLabelText("Your request")).toHaveFocus();
  const intent = screen.getByLabelText("What do you need?");
  expect(intent).toHaveValue("change");
  // The kind of help decides whether the prompt asks for code changes, so it comes before the request text.
  expect(
    intent.compareDocumentPosition(screen.getByLabelText("Your request")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy prompt" })).toBeDisabled();
  expect(screen.getByLabelText("Prompt").closest("details")).not.toHaveAttribute("open");
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Copy prompt" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Make the chart taller." } });
  expect(screen.getByRole("button", { name: "Copy prompt" })).toBeEnabled();
});

it("updates an open composer's applied context and copied prompt without losing the draft", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  const view = render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Make this clearer." } });
  view.rerender(<Page context={{ ...report, filters: { ...report.filters, store: "sample-store-b" } }} />);
  await waitFor(() =>
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain('store="sample-store-b"'),
  );
  expect(screen.getByLabelText("Your request")).toHaveValue("Make this clearer.");
  expect(screen.getByRole("region", { name: "Current report" })).toHaveTextContent("sample-store-b");
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('store="sample-store-b"')));
});

it("identifies a card metric by position and declared label, then drops it when filters change", async () => {
  const cards = (
    <section data-agent-target="Creative performance" data-agent-component="CardGrid">
      <article data-agent-item="2">
        <div data-agent-element="Spend">PRIVATE_ROW_SENTINEL</div>
      </article>
    </section>
  );
  const content = (context: AgentReportContext) => (
    <>
      <main>
        <header data-agent-page={JSON.stringify(context)} />
        {cards}
      </main>
      <AgentPrompt mode="sample" build="abc123" />
    </>
  );
  const view = render(content(report));
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  fireEvent.change(screen.getByLabelText("Your request"), { target: { value: "Increase the spacing." } });
  fireEvent.click(screen.getByRole("button", { name: "Pick an element" }));
  fireEvent.click(screen.getByText("PRIVATE_ROW_SENTINEL"));
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain("Creative performance (Card grid) · Card 2 · Spend");
  expect(prompt).not.toContain("PRIVATE_ROW_SENTINEL");
  view.rerender(content({ ...report, filters: { ...report.filters, from: "2026-09-02" } }));
  await waitFor(() => expect(screen.getByLabelText("Target")).toHaveValue(""));
  expect(screen.getByLabelText("Your request")).toHaveValue("Increase the spacing.");
});
