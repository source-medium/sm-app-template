import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CardImage } from "@/components/patterns/card-image";

describe("CardImage", () => {
  it("renders a lazy, no-referrer image and swaps in the text fallback when it fails", () => {
    render(
      <CardImage
        src="https://scontent.xx.fbcdn.net/expired.jpg"
        alt="Spring colors"
        fallback={<p>Fresh shades for longer days.</p>}
      />,
    );
    const image = screen.getByRole("img", { name: "Spring colors" });
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.error(image);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh shades for longer days.")).toBeInTheDocument();
  });

  it("tries the next published URL before the text fallback, and reports when every source failed", () => {
    const onUnavailable = vi.fn();
    render(
      <CardImage
        src="https://www.facebook.com/ads/image/?d=blocked"
        fallbackSrc="https://scontent.xx.fbcdn.net/thumb.jpg"
        alt="Spring colors"
        fallback={<p>Fresh shades for longer days.</p>}
        onUnavailable={onUnavailable}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Spring colors" }));
    const thumbnail = screen.getByRole("img", { name: "Spring colors" });
    expect(thumbnail).toHaveAttribute("src", "https://scontent.xx.fbcdn.net/thumb.jpg");
    expect(screen.queryByText("Fresh shades for longer days.")).not.toBeInTheDocument();
    expect(onUnavailable).not.toHaveBeenCalled();
    fireEvent.error(thumbnail);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh shades for longer days.")).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("treats a fallback equal to the source as one source", () => {
    const onUnavailable = vi.fn();
    render(
      <CardImage
        src="https://cdn.example.com/a.jpg"
        fallbackSrc="https://cdn.example.com/a.jpg"
        alt="Same"
        fallback="S"
        onUnavailable={onUnavailable}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Same" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("attempts a new source after a previous image failed", () => {
    const { rerender } = render(<CardImage src="https://example.com/expired.png" alt="Store" fallback="S" />);
    fireEvent.error(screen.getByRole("img", { name: "Store" }));
    rerender(<CardImage src="https://example.com/current.png" alt="Store" fallback="S" />);
    expect(screen.getByRole("img", { name: "Store" })).toHaveAttribute("src", "https://example.com/current.png");
  });
});
