import Link from "next/link";

import BottlePlaceholder from "@/components/ui/BottlePlaceholder";

import type { FragranceReference } from "../types/chatbot.types";

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type FragranceCardsProps = {
  items: FragranceReference[];
};

export default function FragranceCards({ items }: FragranceCardsProps) {
  return (
    <div className="flex max-w-[82%] flex-col gap-2.5 self-start">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-center gap-3 rounded-2xl rounded-bl-[4px] border border-border bg-surface p-3 transition-colors hover:border-primary/40"
        >
          <BottlePlaceholder className="h-12 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-base text-text italic">
              {item.name}
            </div>
            <div className="truncate font-sans text-[11px] font-light tracking-[0.1em] text-text-muted uppercase">
              {item.brand}
            </div>
          </div>
          <div className="shrink-0 text-right">
            {item.price !== null && (
              <div className="font-serif text-sm text-text">
                {priceFormatter.format(item.price)}
              </div>
            )}
            <div className="font-sans text-[10px] font-light tracking-[0.1em] text-primary uppercase">
              {item.price !== null ? "Ver en catálogo →" : "Ver precio y stock →"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
