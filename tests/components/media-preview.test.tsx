import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaPreview, type PreviewMedia } from "@/components/patterns/media-preview";

const TWO_IMAGES: PreviewMedia[] = [
  { kind: "image", src: "https://cdn.example.com/one.jpg" },
  { kind: "image", src: "https://cdn.example.com/two.jpg" },
];

describe("MediaPreview", () => {
  it("renders controls as a sibling of the scrollable track and wires aria-controls to the track id", () => {
    render(<MediaPreview items={TWO_IMAGES} title="Summer hero" fallback={<span>Fallback</span>} />);
    const outer = screen.getByRole("group", { name: "Summer hero media" });
    const track = screen.getByRole("group", { name: "Scrollable media" });
    const prev = screen.getByRole("button", { name: "Previous media" });
    const next = screen.getByRole("button", { name: "Next media" });

    expect(track.id).toBeTruthy();
    expect(prev).toHaveAttribute("aria-controls", track.id);
    expect(next).toHaveAttribute("aria-controls", track.id);
    expect(track.contains(prev)).toBe(false);
    expect(track.contains(next)).toBe(false);
    expect(outer.contains(prev)).toBe(true);
    expect(outer.contains(next)).toBe(true);
    expect(track.children).toHaveLength(TWO_IMAGES.length);
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    expect(screen.getByText("Image 1 of 2")).toBeVisible();
  });

  it("ignores scroll events when clientWidth is zero instead of setting index to NaN", () => {
    render(<MediaPreview items={TWO_IMAGES} title="Summer hero" fallback={<span>Fallback</span>} />);
    const track = screen.getByRole("group", { name: "Scrollable media" });
    Object.defineProperty(track, "clientWidth", { value: 0, configurable: true });
    Object.defineProperty(track, "scrollLeft", { value: 240, configurable: true });

    fireEvent.scroll(track);

    expect(screen.getByText("Image 1 of 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous media" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next media" })).toBeEnabled();
  });

  it("advances slide index on scroll with a positive clientWidth and pauses off-slide playing videos", () => {
    const items: PreviewMedia[] = [
      { kind: "video", src: "https://cdn.example.com/clip.mp4", poster: null },
      { kind: "image", src: "https://cdn.example.com/two.jpg" },
    ];
    render(<MediaPreview items={items} title="Video hero" fallback={<span>Fallback</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "Play Video hero, video 1" }));
    const track = screen.getByRole("group", { name: "Scrollable media" });
    const video = track.querySelector("video");
    if (!video) throw new Error("Expected video element after clicking play");
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
    Object.defineProperty(video, "paused", { value: false, configurable: true });
    Object.defineProperty(track, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(track, "scrollLeft", { value: 300, configurable: true });

    fireEvent.scroll(track);

    expect(screen.getByText("Image 2 of 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous media" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next media" })).toBeDisabled();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("omits controls when there is only one media item", () => {
    render(<MediaPreview items={TWO_IMAGES.slice(0, 1)} title="Single hero" fallback={<span>Fallback</span>} />);
    expect(screen.queryByRole("button", { name: "Previous media" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next media" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Scrollable media" })).toBeNull();
  });
});
