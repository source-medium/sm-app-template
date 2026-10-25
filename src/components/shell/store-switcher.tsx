"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, LayoutGrid, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StoreAvatar } from "@/components/patterns/store-avatar";
import type { StoreOption } from "@/lib/data/stores.server";
import type { SearchParams } from "@/lib/filters";
import {
  allStoresHref,
  allStoresPath,
  storeReportPath,
  STORE_SWITCHER_SLOT,
  switchStoreHref,
} from "@/lib/store-navigation";

// The server-rendered header slot is stable for the lifetime of the app layout.
const subscribeToHeader = () => () => {};
const headerSlot = () => document.getElementById(STORE_SWITCHER_SLOT);
const serverSlot = () => null;

/** The report supplies applied state. Date drafts never participate in switching stores. */
export function StoreSwitcher({
  stores,
  storeId,
  pathname,
  params,
  fixedStore,
  allStores = false,
}: {
  stores: StoreOption[];
  storeId: string;
  pathname: string;
  params: SearchParams;
  fixedStore: boolean;
  allStores?: boolean;
}) {
  const router = useRouter();
  const host = useSyncExternalStore(subscribeToHeader, headerSlot, serverSlot);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openedByTouch = useRef(false);
  const selected = stores.find((store) => store.id === storeId);
  const portfolio = fixedStore ? undefined : allStoresPath();
  const storePath = allStores ? storeReportPath() : pathname;
  const counts = new Map<string, number>();
  const groups = new Map<string | null, StoreOption[]>();
  for (const store of stores) counts.set(store.label, (counts.get(store.label) ?? 0) + 1);
  const storeLabel = (store: StoreOption) =>
    (counts.get(store.label) ?? 0) > 1 ? `${store.label} (${store.id})` : store.label;
  const storeDetail = (store: StoreOption) => {
    const domain = store.domain !== store.label ? store.domain : null;
    const id = store.id !== store.label && (!store.domain || (counts.get(store.label) ?? 0) > 1) ? store.id : null;
    return [domain, id].filter(Boolean).join(" · ");
  };
  const label = allStores ? "All stores" : selected ? storeLabel(selected) : storeId;
  for (const store of stores) {
    if (
      ![store.label, store.id, store.domain ?? "", store.brand ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
      continue;
    const members = groups.get(store.brand) ?? [];
    members.push(store);
    groups.set(store.brand, members);
  }
  function navigate(href: string, nextLabel: string) {
    setOpen(false);
    setDestination(nextLabel);
    startTransition(() => router.push(href, { scroll: false }));
  }
  if (!host) return null;
  return createPortal(
    <div
      data-slot="store-switcher"
      data-agent-target="Store"
      data-agent-component="StoreSwitcher"
      className="min-w-0 py-1 lg:max-w-72 lg:py-0"
    >
      <Popover
        open={open}
        onOpenChange={(value) => {
          setSearch("");
          setOpen(value);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={fixedStore || pending || stores.length === 0}
            aria-label={`Store: ${label}`}
            aria-description={fixedStore ? "Only this store is available." : "Choose a store."}
            aria-busy={pending}
            data-store-id={allStores ? "all" : storeId}
            data-store-name={allStores ? undefined : selected?.label}
            onPointerDown={(event) => {
              openedByTouch.current = event.pointerType === "touch";
            }}
            onKeyDown={() => {
              openedByTouch.current = false;
            }}
            className="h-11 w-full min-w-0 justify-start gap-2.5 px-2 text-left disabled:opacity-100 data-[state=open]:border-ring data-[state=open]:bg-accent"
          >
            {pending ? (
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center">
                <LoaderCircle className="size-4 motion-safe:animate-spin" />
              </span>
            ) : allStores ? (
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
              >
                <LayoutGrid className="size-4" />
              </span>
            ) : (
              <StoreAvatar label={selected?.label ?? storeId} logoUrl={selected?.logoUrl ?? null} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {pending ? "Switching store…" : fixedStore ? "Store" : "Switch store"}
              </span>
              <span className="block truncate leading-4" title={label}>
                {label}
              </span>
            </span>
            {!fixedStore && <ChevronDown aria-hidden className="size-4 text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={menu}
          align="start"
          tabIndex={-1}
          aria-label="Switch store"
          className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            // A tap should reveal the stores without opening the phone's keyboard.
            (openedByTouch.current ? menu.current : searchInput.current)?.focus();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const fromSearch = event.target === searchInput.current;
            if (fromSearch && (event.key === "Home" || event.key === "End")) return;
            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[data-store-option]:not(:disabled), [data-all-stores]",
              ),
            );
            const current = options.indexOf(event.target as HTMLButtonElement);
            if (!fromSearch && current === -1) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : fromSearch
                    ? event.key === "ArrowDown"
                      ? 0
                      : options.length - 1
                    : current + (event.key === "ArrowDown" ? 1 : -1);
            (options[next] ?? searchInput.current)?.focus();
          }}
        >
          <div className="relative shrink-0 border-b p-2">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchInput}
              type="search"
              aria-label="Search stores"
              placeholder="Search stores…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              className="pl-9"
            />
          </div>
          <div
            className="max-h-[min(22rem,50dvh)] min-h-0 overflow-y-auto overscroll-contain p-2"
            aria-label="Available stores"
          >
            {[...groups].map(([brand, members]) => (
              <section key={brand ?? ""} aria-label={brand ?? "Stores"} className="py-1">
                {brand && <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">{brand}</h2>}
                {members.map((store) => (
                  <Button
                    key={store.id}
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2 text-left whitespace-normal aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                    disabled={!storePath}
                    aria-current={!allStores && store.id === storeId ? "page" : undefined}
                    data-store-option={store.id}
                    aria-label={storeLabel(store)}
                    aria-description={storeDetail(store) || undefined}
                    onClick={() => {
                      if (!allStores && store.id === storeId) setOpen(false);
                      else if (storePath) navigate(switchStoreHref(storePath, params, store.id), storeLabel(store));
                    }}
                  >
                    <StoreAvatar label={store.label} logoUrl={store.logoUrl} />
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block">{store.label}</span>
                      {storeDetail(store) && (
                        <span className="block text-xs font-normal text-muted-foreground">{storeDetail(store)}</span>
                      )}
                    </span>
                    {!allStores && store.id === storeId && <Check aria-hidden className="ml-auto shrink-0" />}
                  </Button>
                ))}
              </section>
            ))}
            {!groups.size && (
              <div className="px-2 py-4 text-center text-sm">
                <p role="status" className="font-medium">
                  No matching stores
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setSearch("");
                    searchInput.current?.focus();
                  }}
                >
                  Clear search
                </Button>
              </div>
            )}
          </div>
          {portfolio && (
            <div className="shrink-0 border-t p-2">
              <Button
                type="button"
                variant="ghost"
                data-all-stores
                aria-label="All stores"
                className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2 text-left aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                aria-current={allStores ? "page" : undefined}
                onClick={() => (allStores ? setOpen(false) : navigate(allStoresHref(portfolio, params), "All stores"))}
              >
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <LayoutGrid className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">All stores</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {stores.length === 1 ? "View store performance" : `Compare ${stores.length} stores`}
                  </span>
                </span>
                {allStores && <Check aria-hidden className="shrink-0" />}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {pending && (
        <span role="status" className="sr-only">
          Switching to {destination}…
        </span>
      )}
    </div>,
    host,
  );
}
