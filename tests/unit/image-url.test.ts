import { expect, it } from "vitest";
import { safeImageUrl } from "@/lib/image-url";

it("accepts HTTPS catalog images and local sample assets without credentials", () => {
  expect(safeImageUrl(" https://cdn.example.com/photo.jpg?size=100 ")).toBe(
    "https://cdn.example.com/photo.jpg?size=100",
  );
  expect(safeImageUrl("/sample-products/blend-pouch.webp")).toBe("/sample-products/blend-pouch.webp");
  for (const source of [
    null,
    "",
    "broken",
    "http://example.com/photo",
    "javascript:alert(1)",
    "data:image/png;base64,x",
    "//example.com/photo",
    "https://user:secret@example.com/photo",
  ])
    expect(safeImageUrl(source)).toBeNull();
});
