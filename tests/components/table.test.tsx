import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

/** jsdom has no layout, so the test sets the frame's scroll geometry itself. */
function setGeometry(element: HTMLElement, geometry: Record<string, number>) {
  for (const [key, value] of Object.entries(geometry))
    Object.defineProperty(element, key, { configurable: true, value });
}

describe("Table", () => {
  it("marks only the edges that have more rows or columns beyond them, as the frame scrolls", () => {
    render(
      <Table regionLabel="Wide table">
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const frame = screen.getByRole("region", { name: "Wide table" });
    const edges = () => ["start", "end", "top", "bottom"].filter((edge) => frame.hasAttribute(`data-more-${edge}`));
    expect(edges()).toEqual([]);

    setGeometry(frame, {
      scrollWidth: 600,
      clientWidth: 300,
      scrollHeight: 900,
      clientHeight: 500,
      scrollLeft: 0,
      scrollTop: 0,
    });
    fireEvent.scroll(frame);
    expect(edges()).toEqual(["end", "bottom"]);

    setGeometry(frame, { scrollLeft: 150, scrollTop: 200 });
    fireEvent.scroll(frame);
    expect(edges()).toEqual(["start", "end", "top", "bottom"]);

    // At the far end a fractional pixel left over still counts as the end.
    setGeometry(frame, { scrollLeft: 299.5, scrollTop: 400 });
    fireEvent.scroll(frame);
    expect(edges()).toEqual(["start", "top"]);
  });
});
