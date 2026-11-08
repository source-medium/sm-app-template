/** Names each row by its product name; only products that share a name also show their reference. */
export function productNames(rows: readonly { label: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  return (row: { label: string; reference: string }) =>
    (counts.get(row.label) ?? 0) > 1 ? `${row.label} (${row.reference})` : row.label;
}
