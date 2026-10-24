import { SelectFilter } from "@/components/patterns/select-filter";
import { ErrorState } from "@/components/patterns/data-states";
import { orderDateLabel, type OrderDateBasis } from "@/lib/order-scope";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import { AttributionView } from "./attribution-view";
import { ORDERS_RELATION } from "./rows";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { DataTable } from "@/components/patterns/data-table";
import { buttonVariants } from "@/components/ui/button";
import { ReportPage } from "@/components/shell/report-page";
import { REPORT_FILTER_FORM_ID, parseSalesChannel, single, withParams, type SearchParams } from "@/lib/filters";
import { EMPTY_VALUE, formatCount, formatInstant, formatLabel, formatMoney, formatWallTime } from "@/lib/format";
import { OrderDrawer } from "./order-drawer";
import { OrderSearchForm } from "./search-form";
import {
  decodeRef,
  encodeRef,
  getOrderDetail,
  getOrderAttribution,
  getOrders,
  getOrderChannels,
  type OrderDetail,
  type OrderRef,
  type OrdersFilters,
  type OrdersPage,
} from "./queries";
import { SectionHeader } from "@/components/patterns/section-header";

export const metadata: Metadata = { title: "Orders" };

const PATHNAME = "/orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = single(params, "q")?.trim().slice(0, 64) || null;
  const channel = parseSalesChannel(params);
  const basisParam = single(params, "date_basis");
  const dateBasis: OrderDateBasis | null = basisParam === "created" || basisParam === "processed" ? basisParam : null;
  const validOnly = single(params, "population") === "valid";
  const country = single(params, "country") ? normalizeCountry((single(params, "country") ?? "").slice(0, 100)) : null;
  const region = single(params, "region")
    ? normalizeRegion(country, (single(params, "region") ?? "").slice(0, 100))
    : null;
  const scopeIssue =
    (basisParam && !dateBasis ? "Choose a supported date basis." : null) ??
    (region && !country ? "Choose a country before a shipping region." : null) ??
    (single(params, "population") && !validOnly ? "Choose a supported order population." : null);
  const candidateCursor = decodeRef(single(params, "cursor"));
  const cursor = (candidateCursor?.dateBasis ?? null) === dateBasis ? candidateCursor : null;
  const selected = decodeRef(single(params, "order"));

  return (
    <ReportPage
      dataStatusAfterControls
      sources={[
        {
          relation: ORDERS_RELATION,
          scope: `One order per row, filtered by ${orderDateLabel(dateBasis)}, sales channel and shipping geography. ${validOnly ? "Valid orders only." : "Includes orders regardless of valid-order status."}`,
        },
      ]}
      title="Orders"
      description="Explore orders for one store by the applied local date basis. Open an order to see its details."
      pathname={PATHNAME}
      params={params}
      agentFilters={{
        sales_channel: channel,
        date_basis: dateBasis,
        population: validOnly ? "valid" : "all",
        country,
        region,
      }}
      agentOmissions={[
        ...(search ? ["Search text"] : []),
        ...(cursor ? ["Page cursor"] : []),
        ...(selected ? ["Order details"] : []),
      ]}
    >
      {({ filters, params: linkParams, timeZone, currency, dataStatus }) => {
        const orderFilters: OrdersFilters = {
          ...filters,
          search,
          cursor,
          channel,
          dateBasis,
          validOnly,
          country,
          region,
        };
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4">
              <Suspense
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
                fallback={<LoadingState variant="control" label="Loading sales channels" />}
              >
                <DataRegion
                  timestamp={false}
                  load={() => getOrderChannels(orderFilters)}
                  isEmpty={() => false}
                  emptyMessage="No sales channels in this range."
                >
                  {(channels) => <ChannelFilter value={channel} channels={channels} />}
                </DataRegion>
              </Suspense>
              <SelectFilter
                name="date_basis"
                label="Date basis"
                value={dateBasis ?? ""}
                options={[
                  { value: "", label: "Processed (default)" },
                  { value: "processed", label: "Processed, created fallback (catalog)" },
                  { value: "created", label: "Created" },
                ]}
              />
              <SelectFilter
                name="population"
                label="Order population"
                value={validOnly ? "valid" : ""}
                options={[
                  { value: "", label: "All orders" },
                  { value: "valid", label: "Valid orders" },
                ]}
              />
              {country && <input type="hidden" name="country" value={country} form={REPORT_FILTER_FORM_ID} />}
              {region && <input type="hidden" name="region" value={region} form={REPORT_FILTER_FORM_ID} />}
              <OrderSearchForm search={search ?? ""} />
            </div>
            <p className="text-sm text-muted-foreground">
              Applied date basis: {orderDateLabel(dateBasis)}.{" "}
              {validOnly ? "Valid orders only." : "All order validity states."}{" "}
              {country && (
                <>
                  Shipping destination: {country}
                  {region ? ` / ${region}` : ""}.{" "}
                  <Link
                    prefetch={false}
                    href={withParams(PATHNAME, linkParams, {
                      country: null,
                      region: null,
                      cursor: null,
                      order: null,
                      evidence: null,
                    })}
                    className="underline"
                  >
                    Clear geography
                  </Link>
                </>
              )}
            </p>
            {dataStatus}
            {scopeIssue ? (
              <ErrorState title="Check order scope" remedy={scopeIssue} tone="warning" />
            ) : (
              <>
                <SectionHeader id="orders-heading" title="Orders, newest first" headingProps={{ tabIndex: -1 }} />
                <Suspense
                  key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${search}|${dateBasis}|${validOnly}|${country}|${region}|${single(params, "cursor")}`}
                  fallback={<LoadingState variant="table" label="Loading orders" />}
                >
                  <DataRegion
                    timestamp={timeZone}
                    load={() => getOrders(orderFilters)}
                    isEmpty={(data) => data.orders.length === 0}
                    emptyMessage={
                      search
                        ? "No orders match that search, sales channel, and date range."
                        : "No orders match this store, sales channel, and date range."
                    }
                    emptyAction={
                      search
                        ? { href: withParams(PATHNAME, linkParams, { q: null, cursor: null }), label: "Clear search" }
                        : channel
                          ? {
                              href: withParams(PATHNAME, linkParams, { sales_channel: null, cursor: null }),
                              label: "Show all sales channels",
                            }
                          : undefined
                    }
                  >
                    {(data) => (
                      <OrdersList
                        data={data}
                        params={linkParams}
                        paged={cursor !== null}
                        currency={currency}
                        dateBasis={dateBasis}
                      />
                    )}
                  </DataRegion>
                </Suspense>
              </>
            )}
            {selected && (
              <OrderDrawer
                title="Order details"
                closeHref={withParams(PATHNAME, linkParams, { order: null, evidence: null })}
                returnHref={withParams(PATHNAME, linkParams, { order: encodeRef(selected) })}
              >
                <Suspense fallback={<LoadingState variant="table" label="Loading the order" />}>
                  <DataRegion
                    timestamp={timeZone}
                    load={() => getOrderDetail(filters.storeId, selected)}
                    isEmpty={(order) => order === null}
                    emptyMessage="This order is not in the selected store."
                  >
                    {(order) =>
                      order ? (
                        <>
                          <OrderDetailList order={order} timeZone={timeZone} currency={currency} />
                          {single(params, "evidence") === "attribution" ? (
                            <Suspense fallback={<LoadingState variant="table" label="Loading attribution evidence" />}>
                              <DataRegion
                                timestamp={timeZone}
                                load={() => getOrderAttribution(filters.storeId, selected)}
                                isEmpty={() => false}
                                emptyMessage="No attribution signals were published."
                              >
                                {(data) => <AttributionView data={data} />}
                              </DataRegion>
                            </Suspense>
                          ) : (
                            <Link
                              prefetch={false}
                              className="mt-5 inline-block underline"
                              href={withParams(PATHNAME, linkParams, { evidence: "attribution" })}
                              scroll={false}
                            >
                              Why attributed here?
                            </Link>
                          )}
                        </>
                      ) : null
                    }
                  </DataRegion>
                </Suspense>
              </OrderDrawer>
            )}
          </div>
        );
      }}
    </ReportPage>
  );
}

function OrdersList({
  data,
  params,
  paged,
  currency,
  dateBasis,
}: {
  dateBasis: OrderDateBasis | null;
  data: OrdersPage;
  params: SearchParams;
  paged: boolean;
  currency: string | null;
}) {
  const linkTo = (ref: OrderRef) => withParams(PATHNAME, params, { order: encodeRef(ref), evidence: null });
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        caption="Orders, newest first"
        paginate={false}
        columns={[
          { key: "order", header: "Order", sortable: false, nowrap: true },
          { key: "processed", header: orderDateLabel(dateBasis), sortable: false },
          { key: "channel", header: "Channel", sortable: false },
          { key: "type", header: "Type", sortable: false },
          { key: "status", header: "Payment", sortable: false },
          { key: "items", header: "Items", align: "right", sortable: false },
          { key: "revenue", header: "Net revenue", align: "right", sortable: false },
        ]}
        rows={data.orders.map((order) => ({
          id: order.key,
          cells: {
            order: {
              display: order.name ?? order.key,
              href: linkTo({
                processedLocal: order.scopeLocal,
                key: order.key,
                ...(dateBasis ? { dateBasis } : {}),
              }),
            },
            processed: { display: formatWallTime(order.scopeLocal ?? order.processedLocal) },
            channel: { display: [order.channel, order.subChannel].filter(Boolean).join(" · ") || EMPTY_VALUE },
            type: { display: formatLabel(order.orderType) },
            status: { display: formatLabel(order.paymentStatus) },
            items: { display: order.items ?? EMPTY_VALUE },
            revenue: { display: formatMoney(order.netRevenue, currency) },
          },
        }))}
        actions={
          (paged || data.nextCursor) && (
            <nav aria-label="Order pages" className="flex gap-2">
              {paged && (
                <Link
                  prefetch={false}
                  href={withParams(PATHNAME, params, { cursor: null, order: null, evidence: null })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Newest orders
                </Link>
              )}
              {data.nextCursor && (
                <Link
                  prefetch={false}
                  href={withParams(PATHNAME, params, {
                    cursor: encodeRef(data.nextCursor),
                    order: null,
                    evidence: null,
                  })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Older orders
                </Link>
              )}
            </nav>
          )
        }
      />
    </div>
  );
}

function OrderDetailList({
  order,
  timeZone,
  currency,
}: {
  order: OrderDetail;
  timeZone: string;
  currency: string | null;
}) {
  const rows: [string, string][] = [
    ["Order", order.name ?? EMPTY_VALUE],
    ["Order id", order.orderId ?? EMPTY_VALUE],
    ["Processed (store time)", formatWallTime(order.processedLocal)],
    ["Created", order.createdAt ? formatInstant(order.createdAt.iso, timeZone) : EMPTY_VALUE],
    ["Channel", [order.channel, order.subChannel].filter(Boolean).join(" · ") || EMPTY_VALUE],
    ["Sales channel", order.salesChannel ?? EMPTY_VALUE],
    ["Source system", formatLabel(order.sourceSystem)],
    ["Order type", formatLabel(order.orderType)],
    ["Customer order number", formatCount(order.customerOrderIndex)],
    ["Payment status", formatLabel(order.paymentStatus)],
    ["Items", order.items ?? EMPTY_VALUE],
    ["Items refunded", order.refundedItems ?? EMPTY_VALUE],
    ["Products", order.productTitles ?? EMPTY_VALUE],
    ["Gross revenue", formatMoney(order.grossRevenue, currency)],
    ["Discounts", formatMoney(order.discounts, currency)],
    ["Refunds", formatMoney(order.refunds, currency)],
    ["Net revenue", formatMoney(order.netRevenue, currency)],
    ["Shipping", formatMoney(order.shipping, currency)],
    ["Taxes", formatMoney(order.taxes, currency)],
    ["Total revenue", formatMoney(order.totalRevenue, currency)],
    ["Discount codes", order.discountCodes ?? EMPTY_VALUE],
    ["Ships to", [order.shippingState, order.shippingCountry].filter(Boolean).join(", ") || EMPTY_VALUE],
    ["UTM source / medium", [order.utmSource, order.utmMedium].filter(Boolean).join(" / ") || EMPTY_VALUE],
    ["UTM campaign", order.utmCampaign ?? EMPTY_VALUE],
    ["Counts as a valid order", order.isValidOrder === null ? EMPTY_VALUE : order.isValidOrder ? "Yes" : "No"],
    [
      "Cancelled",
      order.cancelledAt
        ? `${formatInstant(order.cancelledAt.iso, timeZone)}${order.cancellationReason ? ` (${order.cancellationReason})` : ""}`
        : "No",
    ],
  ];
  return (
    <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
