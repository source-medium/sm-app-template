import { parseSalesChannel, single, type SearchParams } from "@/lib/filters";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import type { OrderDateBasis } from "@/lib/order-scope";
export function geographyOptions(params: SearchParams) {
  const requestedBasis = single(params, "date_basis");
  const dateBasis: OrderDateBasis = requestedBasis === "created" ? "created" : "processed";
  const country = single(params, "country") ? normalizeCountry((single(params, "country") ?? "").slice(0, 100)) : null;
  const region = single(params, "region")
    ? normalizeRegion(country, (single(params, "region") ?? "").slice(0, 100))
    : null;
  const issue =
    requestedBasis && !["created", "processed"].includes(requestedBasis)
      ? "Choose a supported date basis."
      : region && !country
        ? "A shipping region requires its country."
        : null;
  return { dateBasis, country, region, channel: parseSalesChannel(params), issue };
}
