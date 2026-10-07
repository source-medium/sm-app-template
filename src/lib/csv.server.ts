/** Small, bounded CSV downloads. Feature code owns the query and column definitions. */
import "server-only";

type CsvValue = string | number | bigint | boolean | null;
export type CsvColumn<Row> = { header: string; value: (row: Row) => CsvValue; numeric?: boolean };
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function cell(value: CsvValue, numeric = false): string {
  let text = value === null ? "" : String(value);
  if (numeric && text !== "" && (!NUMBER.test(text) || !Number.isFinite(Number(text)))) {
    throw new Error("CSV numeric columns require finite numeric values.");
  }
  // Quoting alone does not stop spreadsheets from executing warehouse text as a formula.
  if (!numeric && (/^\s*[=+@＝＋＠－-]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvResponse<Row>(filename: string, columns: CsvColumn<Row>[], rows: Row[]): Response {
  if (!/^[a-zA-Z0-9_.-]+\.csv$/.test(filename)) throw new Error("CSV filenames must be plain .csv names.");
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row), column.numeric)).join(","));
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
