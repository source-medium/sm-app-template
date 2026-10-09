import { requireViewer } from "@/lib/auth/require-viewer";
import { StoreAccessError } from "@/lib/auth/store-access";
import { readDictionary } from "@/lib/data/catalog.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { DICTIONARY_FIELD_LIMIT, type DictionaryReport } from "@/lib/report-data";
import snapshot from "../../../../scripts/schema-snapshot.json";

const headers = { "Cache-Control": "private, no-store" };

/** Documentation only: the relation is a bound value, never a table identifier. */
export async function GET(request: Request) {
  await requireViewer();
  const params = new URL(request.url).searchParams;
  const relation = params.get("relation");
  const storeId = params.get("store");
  if (
    !relation ||
    !/^[A-Za-z0-9_]{1,200}$/.test(relation) ||
    !storeId ||
    storeId.length > 200 ||
    params.getAll("relation").length !== 1 ||
    params.getAll("store").length !== 1
  )
    return Response.json({ error: "Choose a report source and store." }, { status: 400, headers });

  try {
    const access = await requireViewer({ storeId });
    const fields =
      access.mode === "sample"
        ? (Object.entries(snapshot.relations).find(([name]) => name === relation)?.[1].columns ?? []).map((column) => ({
            name: column.name,
            type: column.type,
            description: "description" in column ? (column.description ?? null) : null,
          }))
        : (await readDictionary(access.warehouse, storeId, relation, DICTIONARY_FIELD_LIMIT + 1, request.signal)).map(
            (column) => ({
              name: column.column_name,
              type: column.data_type,
              description: column.column_description,
            }),
          );
    const report: DictionaryReport = {
      mode: access.mode,
      fields: fields.slice(0, DICTIONARY_FIELD_LIMIT),
      truncated: fields.length > DICTIONARY_FIELD_LIMIT,
    };
    return Response.json(report, { headers });
  } catch (error) {
    if (error instanceof StoreAccessError)
      return Response.json({ error: "This store is not available in this app." }, { status: 403, headers });
    if (!(error instanceof WarehouseError)) throw error;
    return Response.json({ error: `${error.title}. ${error.remedy}` }, { status: 503, headers });
  }
}
