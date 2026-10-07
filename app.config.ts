/**
 * Non-secret settings you edit freely: branding, navigation, store labels,
 * and example defaults. Secrets and warehouse coordinates never go here;
 * they are runtime values (see .env.example).
 *
 * Rebranding is this file (name, logo) plus src/styles/tokens.css (colors,
 * fonts, radius).
 */
import { ImageIcon, LayoutDashboard, Megaphone, Package, Repeat2, ShoppingBag, type LucideIcon } from "lucide-react";

export type NavItem = { href: `/${string}`; label: string; icon: LucideIcon };

export const appConfig = {
  name: "Store Insights",
  /**
   * An image in /public, such as { src: "/logo.svg", alt: "Acme" }, shown in
   * place of the name (a wordmark or a mark; it fits a 32px-tall slot), or
   * null to show the name. The name is still the browser tab title.
   */
  logo: null as { src: string; alt: string } | null,
  /** Shows "Built on SourceMedium" in the sidebar footer. */
  showSourceMediumAttribution: true,
  /** Numbers and dates are formatted on the server in this locale. */
  locale: "en-US",
  /**
   * Your SourceMedium workspace's reporting currency, as an ISO code such as
   * "USD" or "EUR". Confirm it when connecting data (docs/connect.md).
   * All included money sources must already use this currency. This setting
   * formats amounts; it does not convert them. Null leaves amounts unlabeled.
   */
  currency: null as string | null,
  /** The first entry is the home page. Adding a page is one route file and one entry here. */
  nav: [
    { href: "/overview", label: "Overview", icon: LayoutDashboard },
    { href: "/paid-marketing", label: "Paid marketing", icon: Megaphone },
    { href: "/creatives", label: "Creatives", icon: ImageIcon },
    { href: "/products", label: "Products", icon: Package },
    { href: "/retention", label: "Retention", icon: Repeat2 },
    { href: "/orders", label: "Orders", icon: ShoppingBag },
  ] satisfies NavItem[] as NavItem[],
  /** Optional display names for warehouse store ids (sm_store_id). Unlisted stores show their id. */
  storeLabels: {} as Record<string, string>,
  /** Date picker defaults: the default range ends yesterday (UTC). */
  dateRange: { defaultDays: 28, maxDays: 90 },
};
