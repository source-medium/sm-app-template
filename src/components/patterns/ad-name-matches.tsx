import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AD_NAME_FIELDS,
  MAX_MATCHED_NAMES,
  type AdNameMatches as Matches,
  type AdNameRule,
} from "@/lib/ad-name-filters";

export function AdNameMatches({ data, rules }: { data: Matches; rules: AdNameRule[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Table
        containerClassName="max-h-80 rounded-lg border bg-card"
        containerProps={{ tabIndex: 0, role: "region", "aria-label": "Matching names" }}
      >
        <caption className="sr-only">Matching campaign and ad names</caption>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {AD_NAME_FIELDS.map((field) => (
              <TableHead key={field.value}>{field.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={JSON.stringify(row)}>
              {AD_NAME_FIELDS.map((field) => (
                <TableCell key={field.value} className="max-w-sm min-w-48 break-words whitespace-normal">
                  <HighlightedName text={row[field.value]} rules={rules.filter((rule) => rule.field === field.value)} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {data.truncated
          ? `Showing the first ${MAX_MATCHED_NAMES} distinct name combinations; more matched.`
          : "Distinct name combinations in the matching delivery rows."}{" "}
        Report metrics include all matching rows.
      </p>
    </div>
  );
}

function HighlightedName({ text, rules }: { text: string | null; rules: AdNameRule[] }) {
  if (!text?.trim()) return <span className="text-muted-foreground">No name</span>;
  const lower = text.toLowerCase();
  // Lowercasing can expand a character (İ → i + combining dot). Map match
  // offsets back to whole original characters, including surrogate pairs.
  const source: [number, number][] = [];
  let offset = 0;
  for (const character of text) {
    for (let index = 0; index < character.toLowerCase().length; index++)
      source.push([offset, offset + character.length]);
    offset += character.length;
  }
  const ranges: [number, number][] = [];
  function addRange(start: number, length: number) {
    const first = source[start];
    const last = source[start + length - 1];
    if (first && last) ranges.push([first[0], last[1]]);
  }
  for (const rule of rules) {
    if (rule.operator === "excludes") continue;
    for (const value of rule.values) {
      const term = value.toLowerCase();
      if (rule.operator === "equals") {
        if (lower === term) ranges.push([0, text.length]);
        continue;
      }
      if (rule.operator === "starts_with") {
        if (lower.startsWith(term)) addRange(0, term.length);
        continue;
      }
      let start = lower.indexOf(term);
      while (start !== -1) {
        addRange(start, term.length);
        start = lower.indexOf(term, start + term.length);
      }
    }
  }
  const merged: [number, number][] = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  let end = 0;
  const parts = merged.flatMap(([start, next]) => {
    const prefix = text.slice(end, start);
    end = next;
    return [
      prefix,
      <mark key={start} className="rounded-sm bg-accent text-accent-foreground">
        {text.slice(start, next)}
      </mark>,
    ];
  });
  return (
    <>
      {parts}
      {text.slice(end)}
    </>
  );
}
