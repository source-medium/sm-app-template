/**
 * A stand-in for next/navigation, for components that change the report's URL.
 * Mock the module with `vi.mock("next/navigation", () => navigationModule())`
 * (import it with `vi.hoisted`), set `router.search` to the applied query, and
 * read the hrefs from `router.push` and `router.replace`.
 */
import { vi } from "vitest";

export const router = {
  pathname: "/overview",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  reset() {
    this.pathname = "/overview";
    this.search = "";
    this.push.mockReset();
    this.replace.mockReset();
    this.refresh.mockReset();
  },
};

export function navigationModule() {
  return {
    useRouter: () => router,
    usePathname: () => router.pathname,
    useSearchParams: () => new URLSearchParams(router.search),
  };
}
