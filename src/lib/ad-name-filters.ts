import { z } from "zod";
import { single, type SearchParams } from "./filters";

export const AD_NAME_FIELDS = [
  { value: "campaign", label: "Campaign name" },
  { value: "ad_group", label: "Ad set / group name" },
  { value: "ad", label: "Ad name" },
] as const;
export const AD_NAME_OPERATORS = [
  { value: "contains", label: "Contains" },
  { value: "excludes", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "starts_with", label: "Starts with" },
] as const;

// Bound shared URLs and query parameters. Invalid input never broadens a report silently.
export const MAX_NAME_RULES = 5;
export const MAX_NAME_VALUES = 10;
export const MAX_NAME_VALUE_LENGTH = 200;
// Leave room for other filters and navigation headers that repeat the URL.
export const MAX_NAME_FILTER_QUERY_LENGTH = 4000;
export const NAME_FILTER_SIZE_ERROR =
  "These name filters are too long for a shareable link. Shorten or remove some values.";
export const AdNameRuleSchema = z
  .object({
    field: z.enum(AD_NAME_FIELDS.map((field) => field.value)),
    operator: z.enum(AD_NAME_OPERATORS.map((operator) => operator.value)),
    values: z
      .array(
        z
          .string()
          .min(1)
          .max(MAX_NAME_VALUE_LENGTH)
          .refine((v) => v.trim().length > 0),
      )
      .min(1)
      .max(MAX_NAME_VALUES),
  })
  .strict();
export type AdNameRule = z.infer<typeof AdNameRuleSchema>;
function nameFilterQueryLength(raw: string): number {
  return new URLSearchParams({ names: raw }).toString().length;
}
export const AdNameFiltersSchema = z
  .array(AdNameRuleSchema)
  .max(MAX_NAME_RULES)
  .refine((rules) => nameFilterQueryLength(JSON.stringify(rules)) <= MAX_NAME_FILTER_QUERY_LENGTH, {
    message: NAME_FILTER_SIZE_ERROR,
  });
export type AdNames = Record<AdNameRule["field"], string | null>;
export type AdNameMatches = { rows: AdNames[]; truncated: boolean };
export const MAX_MATCHED_NAMES = 50;

export function parseAdNameFilters(params: SearchParams): { rules: AdNameRule[]; error: string | null } {
  const raw = single(params, "names");
  if (!raw) return { rules: [], error: null };
  const error = "These name filters could not be read. Clear them and add the rules again.";
  if (raw.length > MAX_NAME_FILTER_QUERY_LENGTH || nameFilterQueryLength(raw) > MAX_NAME_FILTER_QUERY_LENGTH)
    return { rules: [], error };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { rules: [], error };
  }
  const parsed = AdNameFiltersSchema.safeParse(value);
  return parsed.success ? { rules: parsed.data, error: null } : { rules: [], error };
}

export function serializeAdNameFilters(rules: readonly AdNameRule[]): string | null {
  return rules.length ? JSON.stringify(rules) : null;
}

/** Same literal, case-insensitive semantics as the warehouse predicate. Missing names never match. */
export function matchesAdNames(names: AdNames, rules: readonly AdNameRule[] = []): boolean {
  return rules.every((rule) => {
    const name = names[rule.field]?.toLowerCase();
    if (!name?.trim()) return false;
    const any = rule.values.some((value) => {
      const term = value.toLowerCase();
      if (rule.operator === "equals") return name === term;
      if (rule.operator === "starts_with") return name.startsWith(term);
      return name.includes(term);
    });
    return rule.operator === "excludes" ? !any : any;
  });
}

export function nameRuleLabel(rule: AdNameRule): string {
  const field = AD_NAME_FIELDS.find((item) => item.value === rule.field)?.label ?? rule.field;
  const operator = AD_NAME_OPERATORS.find((item) => item.value === rule.operator)?.label.toLowerCase() ?? rule.operator;
  return `${field} ${operator} ${rule.values.map((value) => `“${value}”`).join(" or ")}`;
}
