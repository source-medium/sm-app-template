/** Compare a reviewed reference with a scoped app CSV. No warehouse calls or edits to reported measures. */
import { z } from "zod";
import { toUnits } from "../../src/lib/data/decimal";
import { salesChannelValues } from "../../src/lib/filters";

const decimal = z.string().regex(/^-?\d+(?:\.\d{1,9})?$/);
export const Reference = z
  .object({
    report: z.enum(["overview", "business", "platforms"]),
    source: z.string().min(1).max(1000),
    store: z.string().min(1),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    channels: z.array(z.string().min(1)).max(50),
    grain: z.enum(["day", "week", "month"]),
    platform: z.string().default(""),
    metrics: z
      .array(
        z
          .object({
            field: z.string().min(1),
            expected: decimal,
            tolerance: decimal.default("0"),
            definition: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** CSV quoting, escaped quotes and embedded newlines, for bounded app exports. */
export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > 2_000_000) throw new Error("Use a bounded app CSV under 2 MB.");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(value);
      value = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else value += char;
  }
  if (quoted) throw new Error("The CSV has an unfinished quoted value.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length || rows.some((cells) => cells.length !== headers.length))
    throw new Error("Use an unmodified app CSV with unique headers.");
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

export function reconcile(reference: z.output<typeof Reference>, rows: Record<string, string>[]) {
  const channels = [...new Set(reference.channels)].sort();
  if (
    !rows.length ||
    rows.some(
      (row) =>
        row.data_mode !== "live" ||
        row.report !== reference.report ||
        row.store_id !== reference.store ||
        row.from !== reference.from ||
        row.to !== reference.to ||
        row.reporting_currency !== reference.currency ||
        row.grain !== reference.grain ||
        JSON.stringify(salesChannelValues(row.sales_channels ?? row.sales_channel)) !== JSON.stringify(channels) ||
        (reference.report === "platforms" && row.platform !== (reference.platform || "combined")),
    )
  )
    throw new Error(
      "Scope differs or the export is sample data. Match report, store, dates, currency, channels, grain and platform first.",
    );
  const totals = rows.filter((row) => row.row_type === "total");
  if (totals.length !== 1) throw new Error("The export must contain exactly one full-selection total.");
  const total = totals[0];
  return reference.metrics.map((metric) => {
    const actual = total?.[metric.field];
    const tolerance = toUnits(metric.tolerance);
    if (tolerance < 0n) throw new Error("Tolerances must be nonnegative.");
    if (!actual || !/^-?\d+(?:\.\d{1,9})?$/.test(actual))
      return { ...metric, actual: actual ?? null, status: "unresolved" as const };
    const difference = toUnits(actual) - toUnits(metric.expected);
    return {
      ...metric,
      actual,
      status: (difference < 0n ? -difference : difference) <= tolerance ? ("match" as const) : ("unresolved" as const),
    };
  });
}
