"use client";

import { Button } from "@/components/ui/button";

type FragranceLoadMoreProps = {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
};

export default function FragranceLoadMore({
  hasMore,
  loading,
  onLoadMore,
}: FragranceLoadMoreProps) {
  if (!hasMore) return null;

  return (
    <div className="mt-10 flex justify-center font-sans text-sm">
      <Button
        variant="outline"
        className="rounded-full"
        disabled={loading}
        onClick={onLoadMore}
      >
        {loading ? "Cargando..." : "Cargar más"}
      </Button>
    </div>
  );
}
