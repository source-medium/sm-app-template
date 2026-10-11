import "server-only";
import type { QueryParameter } from "./bigquery-rest.server";
import type { AdNameRule } from "../ad-name-filters";

// Verified with pnpm schema rpt_ad_performance_daily. Only this fixed map supplies SQL identifiers.
const COLUMNS = { campaign: "ad_campaign_name", ad_group: "ad_group_name", ad: "ad_name" } as const;

export function adNamePredicate(rules: readonly AdNameRule[] = []) {
  const params: QueryParameter[] = [];
  const clauses = rules.map((rule, index) => {
    const column = COLUMNS[rule.field];
    const alternatives = rule.values
      .map((value, valueIndex) => {
        const name = `name_${index}_${valueIndex}`;
        params.push({ name, type: "STRING", value });
        if (rule.operator === "equals") return `LOWER(${column}) = LOWER(@${name})`;
        if (rule.operator === "starts_with") return `STARTS_WITH(LOWER(${column}), LOWER(@${name}))`;
        return `STRPOS(LOWER(${column}), LOWER(@${name})) > 0`;
      })
      .join(" OR ");
    return `(NULLIF(TRIM(${column}), '') IS NOT NULL AND ${rule.operator === "excludes" ? "NOT " : ""}(${alternatives}))`;
  });
  return { sql: clauses.length ? clauses.join(" AND ") : "TRUE", params };
}
