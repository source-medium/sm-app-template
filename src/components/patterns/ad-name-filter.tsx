"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListFilter, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_FILTER_FORM_ID, single, withParams, type SearchParams } from "@/lib/filters";
import {
  AD_NAME_FIELDS,
  AD_NAME_OPERATORS,
  AdNameFiltersSchema,
  AdNameRuleSchema,
  MAX_NAME_RULES,
  MAX_NAME_VALUES,
  MAX_NAME_VALUE_LENGTH,
  NAME_FILTER_SIZE_ERROR,
  nameRuleLabel,
  serializeAdNameFilters,
  type AdNameRule,
} from "@/lib/ad-name-filters";

export function AdNameFilter({
  pathname,
  params,
  rules,
  error,
}: {
  pathname: string;
  params: SearchParams;
  rules: AdNameRule[];
  error: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<{
    index: number;
    field: AdNameRule["field"];
    operator: AdNameRule["operator"];
    text: string;
  } | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const fieldRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const nameKey = serializeAdNameFilters(rules);
  const [lastRules, setLastRules] = useState(nameKey);
  if (lastRules !== nameKey) {
    setLastRules(nameKey);
    setEditor(null);
    setIssue(null);
  }
  const editingIndex = editor?.index;
  useEffect(() => {
    if (editingIndex !== undefined) fieldRef.current?.focus();
  }, [editingIndex]); // Focus only when opening a rule.

  function apply(next: AdNameRule[]) {
    startTransition(() =>
      router.push(withParams(pathname, params, { names: serializeAdNameFilters(next) }), { scroll: false }),
    );
    setEditor(null);
    triggerRef.current?.focus();
  }
  function edit(index: number, trigger: HTMLButtonElement) {
    const rule = rules[index];
    triggerRef.current = trigger;
    setIssue(null);
    setEditor({
      index,
      field: rule?.field ?? "campaign",
      operator: rule?.operator ?? "contains",
      text: rule?.values.join("\n") ?? "",
    });
  }
  function save() {
    if (!editor) return;
    const parsed = AdNameRuleSchema.safeParse({
      field: editor.field,
      operator: editor.operator,
      values: editor.text.split(/\r?\n/).filter((value) => value.trim().length > 0),
    });
    if (!parsed.success) {
      setIssue(`Enter 1–${MAX_NAME_VALUES} values, one per line, up to ${MAX_NAME_VALUE_LENGTH} characters each.`);
      return;
    }
    const next = [...rules];
    next[editor.index] = parsed.data;
    const collection = AdNameFiltersSchema.safeParse(next);
    if (!collection.success) {
      setIssue(collection.error.issues[0]?.message ?? NAME_FILTER_SIZE_ERROR);
      return;
    }
    apply(collection.data);
  }
  return (
    <section
      data-agent-target="Name filters"
      data-agent-component="AdNameFilter"
      aria-label="Name filters"
      aria-busy={pending}
      className="flex min-w-0 flex-col gap-3"
    >
      {single(params, "names") && (
        <input type="hidden" name="names" value={single(params, "names")} form={REPORT_FILTER_FORM_ID} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {rules.map((rule, index) => (
          <div
            key={index}
            className="flex max-w-full items-stretch rounded-md border border-primary/20 bg-accent text-accent-foreground"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label={`Edit ${nameRuleLabel(rule)}`}
              data-agent-element={`Edit name filter ${index + 1}`}
              className="h-auto min-w-0 shrink gap-1.5 py-1.5 text-left break-words whitespace-normal"
              onClick={(event) => edit(index, event.currentTarget)}
            >
              <span className="min-w-0 wrap-anywhere">{nameRuleLabel(rule)}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label={`Remove ${nameRuleLabel(rule)}`}
              data-agent-element={`Remove name filter ${index + 1}`}
              className="h-auto min-h-8"
              onClick={() => apply(rules.filter((_, i) => i !== index))}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !!error || rules.length >= MAX_NAME_RULES}
          data-agent-element="Add name filter"
          onClick={(event) => edit(rules.length, event.currentTarget)}
        >
          {rules.length ? <Plus aria-hidden /> : <ListFilter aria-hidden />} Add name filter
        </Button>
        {(rules.length > 0 || error) && (
          <Button
            data-agent-element="Clear name filters"
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => apply([])}
          >
            Clear name filters
          </Button>
        )}
        {pending && (
          <span role="status" className="text-sm text-muted-foreground">
            Applying name filters…
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editor && (
        <fieldset className="flex max-w-3xl min-w-0 flex-col gap-3 rounded-lg border bg-card p-4" disabled={pending}>
          <legend className="px-1 text-sm font-medium">
            {editor.index < rules.length ? "Edit name filter" : "New name filter"}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm" htmlFor={`${id}-field`}>
              Name field
              <NativeSelect
                ref={fieldRef}
                id={`${id}-field`}
                value={editor.field}
                onChange={(event) => setEditor({ ...editor, field: event.target.value as AdNameRule["field"] })}
              >
                {AD_NAME_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm" htmlFor={`${id}-operator`}>
              Match
              <NativeSelect
                id={`${id}-operator`}
                value={editor.operator}
                onChange={(event) => setEditor({ ...editor, operator: event.target.value as AdNameRule["operator"] })}
              >
                {AD_NAME_OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${id}-values`}>
            Values, one per line
            <Textarea
              id={`${id}-values`}
              rows={2}
              value={editor.text}
              placeholder="[retargeting]"
              aria-describedby={`${id}-help${issue ? ` ${id}-issue` : ""}`}
              aria-invalid={!!issue}
              onChange={(event) => {
                setEditor({ ...editor, text: event.target.value });
                setIssue(null);
              }}
            />
          </label>
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            {editor.operator === "excludes" ? "Exclude every listed value." : "Match any listed value."} All name
            filters must match. Case-insensitive; punctuation is literal.
          </p>
          {issue && (
            <p id={`${id}-issue`} role="alert" className="text-sm text-destructive">
              {issue}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save}>
              Apply name filter
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditor(null);
                triggerRef.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </fieldset>
      )}
      {rules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Metrics include only delivery rows matching every name filter, using names recorded in the selected dates.
          Missing names do not match.
        </p>
      )}
    </section>
  );
}
