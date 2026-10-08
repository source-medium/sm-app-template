import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentPrompt } from "@/components/shell/agent-prompt";

afterEach(() => vi.unstubAllGlobals());

it("composes a prompt from the page on screen and copies it", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  window.history.replaceState(null, "", "/overview?store=sample-store-b&from=2026-09-01&to=2026-09-07");
  render(
    <>
      <main>
        <h1>Overview</h1>
        <span data-slot="kpi-label">Net revenue</span>
        <div data-slot="card-title">Revenue by day</div>
      </main>
      <AgentPrompt mode="sample" build="abc123" />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  fireEvent.change(screen.getByLabelText("What do you need?"), { target: { value: "check" } });
  fireEvent.change(screen.getByLabelText("Describe it"), { target: { value: "Net revenue looks too high." } });
  const prompt = (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value;
  expect(prompt).toContain("Check a number on this page.");
  expect(prompt).toContain("Net revenue looks too high.");
  expect(prompt).toContain("- Page: Overview (/overview)");
  expect(prompt).toContain("store=sample-store-b, from=2026-09-01, to=2026-09-07");
  expect(prompt).toContain("- Sections on the page: Net revenue; Revenue by day");
  expect(prompt).toContain("- App build: abc123");
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.getByText("Prompt copied.")).toBeInTheDocument());
  expect(writeText).toHaveBeenCalledWith(prompt);
});

it("leaves the prompt on screen for manual copying when the clipboard is unavailable", async () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  render(<AgentPrompt mode="live" build="abc123" />);
  fireEvent.click(screen.getByRole("button", { name: "Ask a coding agent" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
  await waitFor(() => expect(screen.getByText("Could not copy. Select the prompt above and copy it.")).toBeVisible());
  expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toContain("- Data mode: live warehouse data");
});
