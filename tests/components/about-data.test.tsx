import { Component, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AboutData } from "@/components/shell/about-data";

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p>Report crashed</p> : this.props.children;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([{}, { mode: "live", fields: [null], truncated: false }])(
  "keeps malformed dictionary responses inside the optional panel: %j",
  async (body) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    render(
      <AppBoundary>
        <main>
          <h1>Report stays available</h1>
          <AboutData
            mode="sample"
            context={{ pathname: "/test", title: "Test", filters: { store: "store-a" }, currency: null }}
            sources={[{ relation: "obt_orders", scope: "One order per row" }]}
          />
        </main>
      </AppBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About this data" }));
    expect(await screen.findByText(/The dictionary could not load/)).toBeVisible();
    expect(screen.queryByText("Report crashed")).not.toBeInTheDocument();
    expect(screen.getByText("Report stays available")).toBeInTheDocument();
  },
);

it("loads on demand, aborts replaced requests, and ignores a late response from the old source", async () => {
  let finishFirst: (response: Response) => void = () => undefined;
  const first = new Promise<Response>((resolve) => {
    finishFirst = resolve;
  });
  const fetch = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(
      Response.json({
        mode: "sample",
        fields: [{ name: "second_field", type: "NUMERIC", description: null }],
        truncated: false,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(
    <main>
      <AboutData
        mode="sample"
        context={{ pathname: "/test", title: "Test", filters: { store: "store-a" }, currency: null }}
        sources={[
          { relation: "first", scope: "First source" },
          { relation: "second", scope: "Second source" },
        ]}
      />
    </main>,
  );
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "About this data" }));
  const firstSignal = fetch.mock.calls[0]?.[1].signal as AbortSignal;
  expect(firstSignal.aborted).toBe(false);
  fireEvent.change(screen.getByLabelText("Source table"), { target: { value: "second" } });
  expect(await screen.findByText("second_field")).toBeVisible();
  expect(firstSignal.aborted).toBe(true);
  await act(async () =>
    finishFirst(
      Response.json({
        mode: "sample",
        fields: [{ name: "old_field", type: "STRING", description: null }],
        truncated: false,
      }),
    ),
  );
  expect(screen.queryByText("old_field")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect((fetch.mock.calls[1]?.[1].signal as AbortSignal).aborted).toBe(true);
});
