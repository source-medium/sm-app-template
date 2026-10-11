import { describe, expect, it } from "vitest";
import {
  AdNameFiltersSchema,
  AdNameRuleSchema,
  MAX_NAME_FILTER_QUERY_LENGTH,
  matchesAdNames,
  parseAdNameFilters,
  serializeAdNameFilters,
  type AdNameRule,
} from "@/lib/ad-name-filters";
import { adNamePredicate } from "@/lib/data/ad-name-sql";

const names = { campaign: "US | [Retargeting] | 20%_off", ad_group: "Core | 30d", ad: "UGC | evergreen" };
const rule = (field: AdNameRule["field"], operator: AdNameRule["operator"], ...values: string[]): AdNameRule => ({
  field,
  operator,
  values,
});

describe("ad name filters", () => {
  it("matches literal punctuation, case-insensitively, with OR values and AND rules", () => {
    expect(
      matchesAdNames(names, [
        rule("campaign", "contains", "missing", "[retargeting]"),
        rule("ad", "excludes", "test", "draft"),
      ]),
    ).toBe(true);
    expect(matchesAdNames(names, [rule("campaign", "contains", "[retargeting]"), rule("ad", "contains", "test")])).toBe(
      false,
    );
    expect(matchesAdNames(names, [rule("campaign", "contains", "20%_off")])).toBe(true);
    expect(matchesAdNames({ ...names, campaign: "20X-off" }, [rule("campaign", "contains", "20%_off")])).toBe(false);
    expect(matchesAdNames({ ...names, campaign: "retargeting" }, [rule("campaign", "contains", "[retargeting]")])).toBe(
      false,
    );
    expect(matchesAdNames(names, [rule("ad", "excludes", "missing", "UGC")])).toBe(false);
  });
  it("supports equality and prefixes and never matches missing names", () => {
    expect(matchesAdNames(names, [rule("ad_group", "equals", "core | 30D")])).toBe(true);
    expect(matchesAdNames(names, [rule("ad_group", "equals", "Core")])).toBe(false);
    expect(matchesAdNames(names, [rule("ad", "starts_with", "ugc")])).toBe(true);
    expect(matchesAdNames(names, [rule("ad", "starts_with", "evergreen")])).toBe(false);
    for (const operator of ["contains", "equals", "starts_with", "excludes"] as const)
      for (const ad of [null, "", "   "])
        expect(matchesAdNames({ ...names, ad }, [rule("ad", operator, "test")])).toBe(false);
  });
  it("round-trips shared links and rejects invalid or oversized rules without dropping them", () => {
    const rules = [rule("campaign", "contains", "[retargeting]", "x,y", "a&b")];
    const encoded = serializeAdNameFilters(rules);
    expect(parseAdNameFilters({ names: encoded ?? undefined })).toEqual({ rules, error: null });
    expect(parseAdNameFilters({ names: [encoded ?? "", "invalid"] }).rules).toEqual(rules);
    expect(serializeAdNameFilters([])).toBeNull();
    for (const value of [
      "{",
      "null",
      "{}",
      JSON.stringify([rule("ad", "contains", "")]),
      JSON.stringify([{ ...rules[0], field: "__proto__" }]),
      JSON.stringify([rule("ad", "contains", "a".repeat(201))]),
      JSON.stringify(Array(6).fill(rules[0])),
    ]) {
      expect(parseAdNameFilters({ names: value })).toEqual({ rules: [], error: expect.any(String) });
    }
  });
  it("uses parameters for values and fixed SQL operators, including literal wildcard characters", () => {
    const value = "[x]%_' OR TRUE --";
    const query = adNamePredicate([
      rule("campaign", "contains", value),
      rule("ad", "excludes", "test", "draft"),
      rule("ad_group", "starts_with", "US"),
      rule("ad", "equals", "example"),
    ]);
    expect(query.sql).not.toContain(value);
    expect(query.sql).not.toContain("LIKE");
    expect(query.sql).toContain("NULLIF(TRIM(ad_name), '') IS NOT NULL AND NOT (STRPOS");
    expect(query.sql).toContain("STARTS_WITH(LOWER(ad_group_name), LOWER(@name_2_0))");
    expect(query.sql).toContain("LOWER(ad_name) = LOWER(@name_3_0)");
    expect(query.params[0]).toEqual({ name: "name_0_0", type: "STRING", value });
    expect(adNamePredicate()).toEqual({ sql: "TRUE", params: [] });
  });
  it("uses one encoded-size budget for drafts and URLs, including Unicode and escaped punctuation", () => {
    for (const value of ["a", '"', "語", "🎨"]) {
      const rules: AdNameRule[] = [];
      for (let count = 1; count <= 5; count++) {
        const next = rule("campaign", "contains", ...Array<string>(10).fill(value.repeat(100)));
        expect(AdNameRuleSchema.safeParse(next).success).toBe(true);
        rules.push(next);
        const raw = serializeAdNameFilters(rules) ?? "";
        const fits = new URLSearchParams({ names: raw }).toString().length <= MAX_NAME_FILTER_QUERY_LENGTH;
        expect(AdNameFiltersSchema.safeParse(rules).success).toBe(fits);
        expect(parseAdNameFilters({ names: raw })).toEqual(
          fits ? { rules, error: null } : { rules: [], error: expect.any(String) },
        );
      }
    }
  });
});
