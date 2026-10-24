/**
 * The sm_channel values SourceMedium counts as valid orders (Sales Channel in its documentation).
 * Summary relations also publish draft_orders, exchanged, excluded and *_via_shopify rows. Those are
 * not sales, and *_via_shopify repeats orders already counted in their direct channel, so summing
 * every row overstates revenue and orders. No imports: app.config.ts reads this too.
 */
export const VALID_SALES_CHANNELS: readonly string[] = ["amazon", "online_dtc", "retail", "tiktok_shop", "wholesale"];
