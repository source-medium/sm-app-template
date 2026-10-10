/** Small, bounded CSV downloads. Feature code owns the query and column definitions. */
import "server-only";
import { requireViewer, type ViewerAccess } from "@/lib/auth/require-viewer";
import { StoreAccessError } from "@/lib/auth/store-access";
import { resolveReportStore } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { dateRangeIssue, parseDateRange, single, type DateRange, type SearchParams } from "@/lib/filters";
import { calendarDate } from "@/lib/format";

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

export type ExportScope = { params: SearchParams; storeId: string; range: DateRange; mode: ViewerAccess["mode"] };

/**
 * Runs an export for the store and dates the report would show. A range the
 * page would ask to correct is a 400, never a silently different period.
 * Store and warehouse failures are short JSON errors, not CSV.
 */
export async function csvExport(request: Request, build: (scope: ExportScope) => Promise<Response>): Promise<Response> {
  const params: SearchParams = {};
  for (const [key, value] of new URL(request.url).searchParams) if (params[key] === undefined) params[key] = value;
  try {
    const { mode } = await requireViewer();
    const store = await resolveReportStore(single(params, "store"));
    if (store.status !== "ready") {
      if (store.error) throw store.error;
      return failure(400, {
        title: store.status === "no_store" ? "No store selected" : "This store is not in the store list",
      });
    }
    // Dates are the store's calendar dates, so its time zone decides today.
    const today = calendarDate(new Date(), store.timeZone);
    const issue = dateRangeIssue(params, today);
    if (issue) return failure(400, { title: "Check the date range", remedy: issue });
    return await build({ params, storeId: store.storeId, range: parseDateRange(params, today), mode });
  } catch (error) {
    if (error instanceof StoreAccessError) return failure(403, { title: error.message });
    if (!(error instanceof WarehouseError)) throw error;
    return failure(503, { title: error.title, remedy: error.remedy });
  }
}

function failure(status: number, body: { title: string; remedy?: string }): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
