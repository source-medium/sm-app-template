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

export type NavItem = {
  href: `/${string}`;
  label: string;
  icon: LucideIcon;
  scope?: "all-stores";
  group?: string;
  comparisons?: boolean;
  /**
   * Canonical SourceMedium metric names (dim_semantic_metric_catalog
   * metric_name) this view presents, so "Explore your data" can offer
   * "View in report". Deleting the view's entry removes its links.
   */
  metrics?: readonly string[];
};

export const appConfig = {
  name: "Store Insights",
  /**
   * An image in /public, such as { src: "/logo.svg", alt: "Acme" }, shown in
   * place of the name (a wordmark or a mark; it fits a 32px-tall slot), or
   * null to show the name. The name is still the browser tab title.
   */
  logo: null as { src: string; alt: string } | null,
  /** Shows the SourceMedium mark and attribution in the footer; template resource links remain available. */
  showSourceMediumAttribution: true,
  /** Numbers and dates are formatted on the server in this locale. */
  locale: "en-US",
  /**
   * Optional reporting ISO override, such as "USD", for this deployment.
   * Leave null to use each store’s store_currency_code from dim_stores.
   * An override labels amounts without converting them.
   */
  currency: null as string | null,
  /** Per-store reporting currency overrides. Null explicitly leaves a store unlabeled. Sample data stays USD. */
  reportingCurrencies: {} as Record<string, string | null>,
  /** The first entry is the home page. A page also needs a feature folder and a route; see the sm-add-page skill. */
  nav: [
    {
      group: "Business",
      href: "/overview",
      comparisons: true,
      label: "Overview",
      icon: LayoutDashboard,
      metrics: [
        "order_net_revenue_summary",
        "order_count_summary",
        "total_ad_spend_summary",
        "marketing_efficiency_ratio_summary",
        "website_sessions_summary",
      ],
    },
    { group: "Business", href: "/performance", comparisons: true, label: "Performance tables", icon: Table2 },
    { group: "Business", href: "/stores", comparisons: true, label: "All stores", icon: Store, scope: "all-stores" },
    { group: "Marketing", href: "/paid-marketing", comparisons: true, label: "Paid marketing", icon: Megaphone },
    {
      group: "Marketing",
      href: "/creatives",
      label: "Creatives",
      icon: ImageIcon,
      metrics: [
        "total_ad_spend",
        "total_ad_clicks",
        "total_ad_impressions",
        "platform_reported_conversions",
        "platform_reported_revenue",
        "platform_return_on_ad_spend",
        "platform_cost_per_conversion",
        "click_through_rate",
      ],
    },
    { group: "Sales", href: "/products", comparisons: true, label: "Products", icon: Package },
    { group: "Sales", href: "/retention", label: "Retention", icon: Repeat2 },
    {
      group: "Sales",
      href: "/geography",
      comparisons: true,
      label: "Geography",
      icon: Map,
      metrics: ["order_net_revenue", "order_count"],
    },
    { group: "Sales", href: "/orders", label: "Orders", icon: ShoppingBag },
    { href: "/data", label: "Explore your data", icon: BookOpen, group: "Reference" },
  ] satisfies NavItem[] as NavItem[],
  /** Optional overrides for dim_stores.store_name. Names and brand groups otherwise come from SourceMedium. */
  storeLabels: {} as Record<string, string>,
  /**
   * Date picker defaults: the default range ends yesterday, in the store's SourceMedium time zone.
   * The maximum holds any calendar quarter (92 days), so quarter presets always fit detail views.
   */
  dateRange: { defaultDays: 28, maxDays: 92 },
  /** Summary reports can deliberately cover a full year; detail views retain the shorter limit. */
  summaryMaxDays: 366,
  /** Optional verified sales-channel defaults for summary reports. Empty means all channels. */
  defaultSalesChannels: [] as string[],
};
