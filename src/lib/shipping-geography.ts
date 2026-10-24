/** Shipping destinations only. State aliases are interpreted within the US, never globally. */
export const UNKNOWN_LOCATION = "(unknown)";
export const US_STATES: Readonly<Record<string, string>> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};
export function normalizeCountry(value: string | null): string {
  const normalized = value?.trim().toUpperCase();
  return !normalized || normalized === UNKNOWN_LOCATION.toUpperCase() ? UNKNOWN_LOCATION : normalized;
}
export function normalizeRegion(country: string | null, value: string | null): string {
  const raw = normalizeCountry(value);
  if (normalizeCountry(country) !== "US") return raw;
  return (
    Object.entries(US_STATES).find(
      ([code, name]) => raw === code || raw === `US-${code}` || raw === name.toUpperCase(),
    )?.[0] ?? raw
  );
}
export const COUNTRY_SQL =
  "COALESCE(NULLIF(NULLIF(UPPER(TRIM(order_shipping_country_code)), ''), '(UNKNOWN)'), '(unknown)')";
// These literals come exclusively from the fixed reviewed crosswalk above, never browser input.
export const REGION_SQL = `CASE WHEN ${COUNTRY_SQL} = 'US' THEN CASE UPPER(TRIM(order_shipping_state)) ${Object.entries(
  US_STATES,
)
  .flatMap(([code, name]) => [code, `US-${code}`, name.toUpperCase()].map((alias) => `WHEN '${alias}' THEN '${code}'`))
  .join(
    " ",
  )} ELSE COALESCE(NULLIF(NULLIF(UPPER(TRIM(order_shipping_state)), ''), '(UNKNOWN)'), '(unknown)') END ELSE COALESCE(NULLIF(NULLIF(UPPER(TRIM(order_shipping_state)), ''), '(UNKNOWN)'), '(unknown)') END`;
