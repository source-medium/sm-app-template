"use client";

import { useEffect, type RefObject } from "react";

/**
 * Marks which edges of a scroll container have more content beyond them, as
 * `data-more-start`, `data-more-end`, `data-more-top` and `data-more-bottom`,
 * so its styles can show a cue only where scrolling would reveal something.
 * Writes attributes directly instead of state: scrolling never re-renders.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const { scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = element;
      // Negative in right-to-left layouts; a pixel of slack absorbs fractional sizes at either end.
      const scrollLeft = Math.abs(element.scrollLeft);
      element.toggleAttribute("data-more-start", scrollLeft > 1);
      element.toggleAttribute("data-more-end", scrollLeft + clientWidth < scrollWidth - 1);
      element.toggleAttribute("data-more-top", scrollTop > 1);
      element.toggleAttribute("data-more-bottom", scrollTop + clientHeight < scrollHeight - 1);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    // The container resizes with the page; its content resizes when rows sort, page or load.
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref]);
}
