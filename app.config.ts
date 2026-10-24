/**
 * Non-secret settings you edit freely: branding, navigation, store labels,
 * and example defaults. Secrets and warehouse coordinates never go here;
 * they are runtime values (see .env.example).
 *
 * Rebranding is this file (name, logo) plus src/styles/tokens.css (colors,
 * fonts, radius) and the app icon at src/app/icon.svg.
 */
import {
  BookOpen,
  Map,
  ImageIcon,
  LayoutDashboard,
  Megaphone,
  Package,
  Repeat2,
  ShoppingBag,
  Store,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";

export type NavItem = {
  href: `/${string}`;
  label: string;
  icon: LucideIcon;
  scope?: "all-stores";
  group?: string;
  comparisons?: boolean;
};

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
   * Verified reporting ISO code, such as "USD", shared by this deployment's
   * monetary inputs. Confirm source alignment before setting it; nominal
   * store currency is not evidence of reporting currency. This labels amounts
   * without converting them. Null leaves live amounts unlabeled.
   */
  currency: null as string | null,
  /** Per-store reporting currency overrides. Null explicitly leaves a store unlabeled. Sample data stays USD. */
  reportingCurrencies: {} as Record<string, string | null>,
  /** The first entry is the home page. A page also needs a feature folder and a route; see the sm-add-page skill. */
  nav: [
    { group: "Business", href: "/overview", comparisons: true, label: "Overview", icon: LayoutDashboard },
    { group: "Business", href: "/performance", comparisons: true, label: "Performance tables", icon: Table2 },
    { group: "Business", href: "/stores", comparisons: true, label: "All stores", icon: Store, scope: "all-stores" },
    { group: "Marketing", href: "/paid-marketing", comparisons: true, label: "Paid marketing", icon: Megaphone },
    { group: "Marketing", href: "/creatives", label: "Creatives", icon: ImageIcon },
    { group: "Sales", href: "/products", comparisons: true, label: "Products", icon: Package },
    { group: "Sales", href: "/retention", label: "Retention", icon: Repeat2 },
    { group: "Sales", href: "/geography", comparisons: true, label: "Geography", icon: Map },
    { group: "Sales", href: "/orders", label: "Orders", icon: ShoppingBag },
    { href: "/data", label: "Data & definitions", icon: BookOpen, group: "Reference" },
  ] satisfies NavItem[] as NavItem[],
  /** Optional overrides for dim_stores.store_name. Names and brand groups otherwise come from SourceMedium. */
  storeLabels: {} as Record<string, string>,
  /** Date picker defaults: the default range ends yesterday, in the store's SourceMedium time zone. */
  dateRange: { defaultDays: 28, maxDays: 90 },
  /** Summary reports can deliberately cover a full year; detail views retain the shorter limit. */
  summaryMaxDays: 366,
  /**
   * The sales channels summary reports (Overview, Performance, Stores) open on: SourceMedium's valid
   * channels unless you verify another default, such as ["online_dtc"]. Empty means every published row.
   */
  defaultSalesChannels: [...VALID_SALES_CHANNELS],
};
