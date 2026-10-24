/**
 * The sm_channel values SourceMedium counts as valid orders, in is_valid_order's order. Summary
 * relations also publish draft_orders, exchanged, excluded and *_via_shopify rows: they are not
 * sales, and *_via_shopify repeats orders already counted in their direct channel.
 */
export const VALID_SALES_CHANNELS: readonly string[] = ["online_dtc", "amazon", "retail", "wholesale", "tiktok_shop"];

export function isValidSalesChannel(channel: string | null): boolean {
  return channel !== null && VALID_SALES_CHANNELS.includes(channel);
}
