"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn, formatCurrencyCLP } from "@/lib/utils";
import type { Listing } from "@/features/listings/types/listing.types";
import type { Vendor } from "@/features/vendors/types/vendor.types";

type ListingsPriceTableProps = {
  listings: Listing[];
  vendors: Vendor[];
  selectedListingId: number | null;
  onSelectListing: (listing: Listing | null) => void;
};

type SortDirection = "asc" | "desc";

export default function ListingsPriceTable({
  listings,
  vendors,
  selectedListingId,
  onSelectListing,
}: ListingsPriceTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<number | "all">("all");

  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

  const vendorOptions = [...new Set(listings.map((listing) => listing.vendorId))]
    .map((vendorId) => ({
      id: vendorId,
      name: vendorsById.get(vendorId)?.name ?? `Vendor #${vendorId}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = listings
    .filter((listing) => !inStockOnly || listing.inStock)
    .filter((listing) => vendorFilter === "all" || listing.vendorId === vendorFilter);

  const sorted = [...filtered].sort((a, b) =>
    sortDirection === "asc" ? a.price - b.price : b.price - a.price
  );

  useEffect(() => {
    const stillVisible =
      selectedListingId !== null && sorted.some((listing) => listing.id === selectedListingId);

    if (!stillVisible) {
      onSelectListing(sorted[0] ?? null);
    }
  }, [sorted, selectedListingId, onSelectListing]);

  if (listings.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface/30 p-6 text-sm font-light text-text-muted">
        Todavía no tenemos precios para este perfume.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 font-sans text-[13px] text-text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
            className="size-4 rounded-sm border-border accent-primary"
          />
          Solo disponibles
        </label>

        <select
          value={vendorFilter}
          onChange={(event) =>
            setVendorFilter(event.target.value === "all" ? "all" : Number(event.target.value))
          }
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-[13px] text-text outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">Todas las tiendas</option>
          {vendorOptions.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface/30 p-6 text-sm font-light text-text-muted">
          Ningún precio coincide con estos filtros.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[480px] border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.14em] text-text-muted uppercase">
                <th className="px-4 py-3 font-normal">Tienda</th>
                <th className="px-4 py-3 font-normal">Tamaño</th>
                <th className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    onClick={() =>
                      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
                    }
                    className="flex items-center gap-1 uppercase tracking-[0.14em]"
                  >
                    Precio
                    {sortDirection === "asc" ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-normal">Stock</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((listing) => {
                const vendor = vendorsById.get(listing.vendorId);
                const selected = listing.id === selectedListingId;

                return (
                  <tr
                    key={listing.id}
                    onClick={() => onSelectListing(listing)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 last:border-b-0 transition-colors hover:bg-surface/40",
                      selected && "bg-surface/60"
                    )}
                  >
                    <td className="px-4 py-3 font-light">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="focused-listing"
                          checked={selected}
                          onChange={() => onSelectListing(listing)}
                          className="accent-primary"
                        />
                        {vendor?.name ?? `Vendor #${listing.vendorId}`}
                      </label>
                    </td>
                    <td className="px-4 py-3 font-light text-text-muted">{listing.sizeMl} ml</td>
                    <td className="px-4 py-3 font-light">{formatCurrencyCLP(listing.price)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] tracking-[0.08em] uppercase",
                          listing.inStock
                            ? "bg-primary text-background"
                            : "border border-border text-text-muted"
                        )}
                      >
                        {listing.inStock ? "Disponible" : "Agotado"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
