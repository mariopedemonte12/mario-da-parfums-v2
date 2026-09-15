"use client";

import { Button } from "@/components/ui/button";

type FragrancePaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function FragrancePagination({
  page,
  totalPages,
  onPageChange,
}: FragrancePaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-10 flex items-center justify-center gap-4 font-sans text-sm">
      <Button
        variant="outline"
        className="rounded-full"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Anterior
      </Button>

      <span className="text-text-muted">
        Página {page} de {totalPages}
      </span>

      <Button
        variant="outline"
        className="rounded-full"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
