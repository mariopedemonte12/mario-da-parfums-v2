"use client";

import { use, useState } from "react";
import Link from "next/link";

import FragranceHero from "@/features/fragrances/components/FragranceHero";
import { useFragranceDetail } from "@/features/fragrances/hooks/useFragranceDetail";
import ListingsPriceTable from "@/features/listings/components/ListingsPriceTable";
import { useListingsByFragrance } from "@/features/listings/hooks/useListingsByFragrance";
import type { Listing } from "@/features/listings/types/listing.types";
import { useVendors } from "@/features/vendors/hooks/useVendors";

type FragranceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default function FragranceDetailPage({ params }: FragranceDetailPageProps) {
  const { id } = use(params);

  const { fragrance, loading: loadingFragrance, error: fragranceError } = useFragranceDetail(id);
  const { listings, loading: loadingListings, error: listingsError } = useListingsByFragrance(id);
  const { vendors, error: vendorsError } = useVendors();

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  if (loadingFragrance) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <p className="text-center text-text-muted">Cargando...</p>
      </main>
    );
  }

  if (fragranceError) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <p className="rounded-lg border border-border bg-surface p-4 text-center text-text">
          {fragranceError}
        </p>
      </main>
    );
  }

  if (!fragrance) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-24 text-center">
        <p className="mb-4 font-serif text-3xl text-primary">No encontramos este perfume</p>
        <Link href="/fragrances" className="font-sans text-sm text-text-muted underline">
          Volver a perfumes
        </Link>
      </main>
    );
  }

  const vendorName =
    selectedListing !== null
      ? (vendors.find((vendor) => vendor.id === selectedListing.vendorId)?.name ?? null)
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 md:px-14 md:py-10">
      <FragranceHero
        fragrance={fragrance}
        selectedListing={selectedListing}
        vendorName={vendorName}
      />

      <section className="mt-16">
        <h2 className="mb-6 font-serif text-2xl text-primary">Dónde comprarlo</h2>

        {listingsError || vendorsError ? (
          <p className="rounded-lg border border-border bg-surface p-4 text-center text-text">
            {listingsError ?? vendorsError}
          </p>
        ) : loadingListings ? (
          <p className="text-text-muted">Cargando precios...</p>
        ) : (
          <ListingsPriceTable
            listings={listings}
            vendors={vendors}
            selectedListingId={selectedListing?.id ?? null}
            onSelectListing={setSelectedListing}
          />
        )}
      </section>
    </main>
  );
}
