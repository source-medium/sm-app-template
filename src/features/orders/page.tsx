import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { DataTable } from "@/components/patterns/data-table";
import { buttonVariants } from "@/components/ui/button";
import { ReportPage } from "@/components/shell/report-page";
import { parseSalesChannel, single, withParams, type SearchParams } from "@/lib/filters";
import { EMPTY_VALUE, formatCount, formatInstant, formatMoney, formatWallTime } from "@/lib/format";
import { OrderDrawer } from "./order-drawer";
import { OrderSearchForm } from "./search-form";
import {
  decodeRef,
  encodeRef,
  getOrderDetail,
  getOrders,
  getOrderChannels,
  type OrderDetail,
  type OrderRef,
  type OrdersFilters,
  type OrdersPage,
} from "./queries";

export const metadata: Metadata = { title: "Orders" };

const PATHNAME = "/orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const search = single(params, "q")?.trim().slice(0, 64) || null;
  const channel = parseSalesChannel(params);
  const cursor = decodeRef(single(params, "cursor"));
  const selected = decodeRef(single(params, "order"));

  return (
    <ReportPage
      title="Orders"
      description="Every order for one store by when it was processed, newest first. Open an order to see its details."
      pathname={PATHNAME}
      params={params}
      agentFilters={{ sales_channel: channel }}
      agentOmissions={[
        ...(search ? ["Search text"] : []),
        ...(cursor ? ["Page cursor"] : []),
        ...(selected ? ["Order details"] : []),
      ]}
    >
      {({ filters, params: linkParams }) => {
        const orderFilters: OrdersFilters = { ...filters, search, cursor, channel };
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4">
              <Suspense
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
                fallback={<LoadingState variant="control" label="Loading sales channels" />}
              >
                <DataRegion
                  timestamp={false}
                  load={() => getOrderChannels(filters)}
                  isEmpty={() => false}
                  emptyMessage="No sales channels in this range."
                >
                  {(channels) => <ChannelFilter value={channel} channels={channels} />}
                </DataRegion>
              </Suspense>
              <OrderSearchForm search={search ?? ""} />
            </div>
            <h2
              id="orders-heading"
              tabIndex={-1}
              className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"
            >
              Orders, newest first
            </h2>
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${search}|${single(params, "cursor")}`}
              fallback={<LoadingState variant="table" label="Loading orders" />}
            >
              <DataRegion
                load={() => getOrders(orderFilters)}
                isEmpty={(data) => data.orders.length === 0}
                emptyMessage={
                  search
                    ? "No orders match that search, sales channel, and date range."
                    : "No orders match this store, sales channel, and date range."
                }
              >
                {(data) => <OrdersList data={data} params={linkParams} paged={cursor !== null} />}
              </DataRegion>
            </Suspense>
            {selected && (
              <OrderDrawer
                title="Order details"
                closeHref={withParams(PATHNAME, linkParams, { order: null })}
                returnHref={withParams(PATHNAME, linkParams, { order: encodeRef(selected) })}
              >
                <Suspense fallback={<LoadingState variant="table" label="Loading the order" />}>
                  <DataRegion
                    load={() => getOrderDetail(filters.storeId, selected)}
                    isEmpty={(order) => order === null}
                    emptyMessage="This order is not in the selected store."
                  >
                    {(order) => (order ? <OrderDetailList order={order} /> : null)}
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

function OrdersList({ data, params, paged }: { data: OrdersPage; params: SearchParams; paged: boolean }) {
  const linkTo = (ref: OrderRef) => withParams(PATHNAME, params, { order: encodeRef(ref) });
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        caption="Orders, newest first"
        paginate={false}
        columns={[
          { key: "order", header: "Order", sortable: false },
          { key: "processed", header: "Processed (store time)", sortable: false },
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
              href: linkTo({ processedLocal: order.processedLocal, key: order.key }),
            },
            processed: { display: formatWallTime(order.processedLocal) },
            channel: { display: [order.channel, order.subChannel].filter(Boolean).join(" · ") || EMPTY_VALUE },
            type: { display: order.orderType ?? EMPTY_VALUE },
            status: { display: order.paymentStatus ?? EMPTY_VALUE },
            items: { display: order.items ?? EMPTY_VALUE },
            revenue: { display: formatMoney(order.netRevenue) },
          },
        }))}
      />
      <nav aria-label="Order pages" className="flex gap-2">
        {paged && (
          <Link
            href={withParams(PATHNAME, params, { cursor: null, order: null })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Newest orders
          </Link>
        )}
        {data.nextCursor && (
          <Link
            href={withParams(PATHNAME, params, { cursor: encodeRef(data.nextCursor), order: null })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Older orders
          </Link>
        )}
      </nav>
    </div>
  );
}

function OrderDetailList({ order }: { order: OrderDetail }) {
  const rows: [string, string][] = [
    ["Order", order.name ?? EMPTY_VALUE],
    ["Order id", order.orderId ?? EMPTY_VALUE],
    ["Processed (store time)", formatWallTime(order.processedLocal)],
    ["Created", order.createdAt ? formatInstant(order.createdAt.iso) : EMPTY_VALUE],
    ["Channel", [order.channel, order.subChannel].filter(Boolean).join(" · ") || EMPTY_VALUE],
    ["Sales channel", order.salesChannel ?? EMPTY_VALUE],
    ["Source system", order.sourceSystem ?? EMPTY_VALUE],
    ["Order type", order.orderType ?? EMPTY_VALUE],
    ["Customer order number", formatCount(order.customerOrderIndex)],
    ["Payment status", order.paymentStatus ?? EMPTY_VALUE],
    ["Items", order.items ?? EMPTY_VALUE],
    ["Items refunded", order.refundedItems ?? EMPTY_VALUE],
    ["Products", order.productTitles ?? EMPTY_VALUE],
    ["Gross revenue", formatMoney(order.grossRevenue)],
    ["Discounts", formatMoney(order.discounts)],
    ["Refunds", formatMoney(order.refunds)],
    ["Net revenue", formatMoney(order.netRevenue)],
    ["Shipping", formatMoney(order.shipping)],
    ["Taxes", formatMoney(order.taxes)],
    ["Total revenue", formatMoney(order.totalRevenue)],
    ["Discount codes", order.discountCodes ?? EMPTY_VALUE],
    ["Ships to", [order.shippingState, order.shippingCountry].filter(Boolean).join(", ") || EMPTY_VALUE],
    ["UTM source / medium", [order.utmSource, order.utmMedium].filter(Boolean).join(" / ") || EMPTY_VALUE],
    ["UTM campaign", order.utmCampaign ?? EMPTY_VALUE],
    ["Counts as a valid order", order.isValidOrder === null ? EMPTY_VALUE : order.isValidOrder ? "Yes" : "No"],
    [
      "Cancelled",
      order.cancelledAt
        ? `${formatInstant(order.cancelledAt.iso)}${order.cancellationReason ? ` (${order.cancellationReason})` : ""}`
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
