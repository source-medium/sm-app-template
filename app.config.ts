/**
 * Non-secret settings you edit freely: branding, navigation, store labels,
 * and example defaults. Secrets and warehouse coordinates never go here;
 * they are runtime values (see .env.example).
 *
 * Rebranding is this file (name, logo) plus src/styles/tokens.css (colors,
 * fonts, radius).
 */
import { ImageIcon, LayoutDashboard, Megaphone, ShoppingBag, type LucideIcon } from "lucide-react";

export type NavItem = { href: `/${string}`; label: string; icon: LucideIcon };

export const appConfig = {
  name: "Store Insights",
  /** A square image in /public, such as { src: "/logo.svg", alt: "Acme" }, or null to show the name. */
  logo: null as { src: string; alt: string } | null,
  /** Shows "Built on SourceMedium" in the sidebar footer. */
  showSourceMediumAttribution: true,
  /** Numbers and dates are formatted on the server in this locale. */
  locale: "en-US",
  /**
   * Money is shown in your SourceMedium reporting currency, the one your
   * warehouse already reports in. Set its ISO code (such as "USD" or "EUR") to
   * show a currency symbol; leave null to show plain amounts.
   */
  currency: null as string | null,
  /** The first entry is the home page. Adding a page is one route file and one entry here. */
  nav: [
    { href: "/overview", label: "Overview", icon: LayoutDashboard },
    { href: "/paid-marketing", label: "Paid marketing", icon: Megaphone },
    { href: "/creatives", label: "Creatives", icon: ImageIcon },
    { href: "/orders", label: "Orders", icon: ShoppingBag },
  ] satisfies NavItem[] as NavItem[],
  /** Optional display names for warehouse store ids (sm_store_id). Unlisted stores show their id. */
  storeLabels: {} as Record<string, string>,
  /** Date picker defaults: the default range ends yesterday (UTC). */
  dateRange: { defaultDays: 28, maxDays: 90 },
};
