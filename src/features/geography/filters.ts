import { parseSalesChannel, single, type SearchParams } from "@/lib/filters";
import { parseShippingDestination } from "@/lib/shipping-geography";
import type { OrderDateBasis } from "@/lib/order-scope";
export function geographyOptions(params: SearchParams) {
  const requestedBasis = single(params, "date_basis");
  const dateBasis: OrderDateBasis = requestedBasis === "created" ? "created" : "processed";
  const { country, region } = parseShippingDestination(params);
  const issue =
    requestedBasis && !["created", "processed"].includes(requestedBasis)
      ? "Choose a supported date basis."
      : region && !country
        ? "A shipping region requires its country."
        : null;
  return { dateBasis, country, region, channel: parseSalesChannel(params), issue };
}
