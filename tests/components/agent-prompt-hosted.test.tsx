import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { AgentPrompt } from "@/components/shell/agent-prompt";
import { HOSTED_CODE_GUIDE } from "@/lib/agent-prompt";

function open(props: Partial<Parameters<typeof AgentPrompt>[0]>) {
  render(
    <main>
      <AgentPrompt mode="live" build="test" {...props} />
    </main>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Vibe code" }));
  return screen.getByRole("dialog", { name: "Vibe code" });
}

it("tells a template-hosted app's viewer to get the code first, with the setup steps and the guide", () => {
  const dialog = open({ hosting: "sourcemedium", codeSource: "template" });
  const steps = within(dialog).getByRole("region", { name: "This version runs the standard template" });
  expect(steps).toHaveTextContent("Customize the code");
  expect(steps).toHaveTextContent("Create repository");
  expect(within(steps).getByRole("link", { name: "How changing a hosted app works" })).toHaveAttribute(
    "href",
    HOSTED_CODE_GUIDE,
  );
});

it("offers the same steps as a fallback when the deploy did not say where the code came from", () => {
  const dialog = open({ hosting: "sourcemedium", codeSource: null });
  expect(within(dialog).getByRole("region", { name: "No copy of this app's code yet?" })).toBeVisible();
});

it("keeps the steps out of an app built from its own repository, and out of self-hosted apps", () => {
  const dialog = open({ hosting: "sourcemedium", codeSource: "repository" });
  expect(within(dialog).queryByText("Customize the code")).toBeNull();
  expect(dialog).toHaveTextContent("working in this app's own copy of its code");
});

it("shows no hosted steps for a self-hosted or sample app", () => {
  const dialog = open({});
  expect(within(dialog).queryByText("Customize the code")).toBeNull();
  expect(dialog).toHaveTextContent("Prepare a request for Codex, Claude Code, or your coding agent.");
});
