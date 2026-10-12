import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("attempts a new source after a previous image failed", () => {
    const { rerender } = render(<CardImage src="https://example.com/expired.png" alt="Store" fallback="S" />);
    fireEvent.error(screen.getByRole("img", { name: "Store" }));
    rerender(<CardImage src="https://example.com/current.png" alt="Store" fallback="S" />);
    expect(screen.getByRole("img", { name: "Store" })).toHaveAttribute("src", "https://example.com/current.png");
  });
});
