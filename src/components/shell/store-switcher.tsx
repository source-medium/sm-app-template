"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LoaderCircle, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const selected = stores.find((store) => store.id === storeId);
  const portfolio = fixedStore ? undefined : allStoresPath();
  const storePath = allStores ? storeReportPath() : pathname;
  const counts = new Map<string, number>();
  const groups = new Map<string | null, StoreOption[]>();
  for (const store of stores) counts.set(store.label, (counts.get(store.label) ?? 0) + 1);
  const storeLabel = (store: StoreOption) =>
    (counts.get(store.label) ?? 0) > 1 ? `${store.label} (${store.id})` : store.label;
  const label = allStores ? "All stores" : selected ? storeLabel(selected) : storeId;
  for (const store of stores) {
    if (![store.label, store.id, store.brand ?? ""].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
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
      className="min-w-0 sm:max-w-64"
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
            variant="ghost"
            disabled={fixedStore || pending || stores.length === 0}
            aria-label={`Store: ${label}`}
            aria-busy={pending}
            data-store-id={allStores ? "all" : storeId}
            className="w-full min-w-0 justify-start px-2"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
            ) : (
              <Store aria-hidden className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">{label}</span>
            {!fixedStore && <ChevronsUpDown aria-hidden className="ml-auto size-3.5 shrink-0" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Switch store"
          className="w-80 max-w-[calc(100vw-2rem)] p-2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInput.current?.focus();
          }}
        >
          <Input
            ref={searchInput}
            type="search"
            aria-label="Search stores"
            placeholder="Search stores or brands…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className="mb-2"
          />
          <div className="max-h-[min(22rem,60dvh)] overflow-y-auto" aria-label="Available stores">
            {portfolio && !search.trim() && (
              <Button
                type="button"
                variant="ghost"
                className="mb-2 w-full justify-start border-b"
                aria-current={allStores ? "page" : undefined}
                onClick={() => (allStores ? setOpen(false) : navigate(allStoresHref(portfolio, params), "All stores"))}
              >
                <Store aria-hidden /> All stores {allStores && <Check aria-hidden className="ml-auto" />}
              </Button>
            )}
            {[...groups].map(([brand, members]) => (
              <section key={brand ?? ""} aria-label={brand ?? "Stores"} className="py-1">
                {brand && <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">{brand}</h2>}
                {members.map((store) => (
                  <Button
                    key={store.id}
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal"
                    disabled={!storePath}
                    aria-current={!allStores && store.id === storeId ? "page" : undefined}
                    data-store-option={store.id}
                    aria-label={storeLabel(store)}
                    onClick={() => {
                      if (!allStores && store.id === storeId) setOpen(false);
                      else if (storePath) navigate(switchStoreHref(storePath, params, store.id), storeLabel(store));
                    }}
                  >
                    <span className="min-w-0 break-words">
                      {store.label}
                      {(counts.get(store.label) ?? 0) > 1 && (
                        <span className="block text-xs text-muted-foreground"> {store.id}</span>
                      )}
                    </span>
                    {!allStores && store.id === storeId && <Check aria-hidden className="ml-auto shrink-0" />}
                  </Button>
                ))}
              </section>
            ))}
            {!groups.size && (
              <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
                No stores match “{search}”. Try a name, brand, or store ID.
              </p>
            )}
          </div>
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
