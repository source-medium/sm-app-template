/**
 * Exact arithmetic for BigQuery NUMERIC values (money), which arrive as
 * decimal text with up to nine fractional digits. Adding them as JavaScript
 * numbers would drift; these helpers add them as integers of 1e-9 units.
 * Ratios (AOV, CPC, ROAS) are approximate by nature and use decimalToNumber.
 */

const SCALE = 9;
const FACTOR = 10n ** BigInt(SCALE);
const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,9}))?$/;

export function toUnits(value: string): bigint {
  const match = DECIMAL.exec(value);
  if (!match) throw new Error(`"${value}" is not a NUMERIC value.`);
  const [, sign, whole = "0", fraction = ""] = match;
  const units = BigInt(whole) * FACTOR + BigInt(fraction.padEnd(SCALE, "0"));
  return sign === "-" ? -units : units;
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / FACTOR;
  const fraction = (absolute % FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Exact sum; null only when every input is null. */
export function sumDecimals(values: readonly (string | null)[]): string | null {
  let total: bigint | null = null;
  for (const value of values) if (value !== null) total = (total ?? 0n) + toUnits(value);
  return total === null ? null : fromUnits(total);
}

/** An approximate number for ratios and charts. */
export function decimalToNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** numerator / denominator, or null when either is missing or the denominator is zero. */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
}
