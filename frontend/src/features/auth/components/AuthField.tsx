import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type AuthFieldProps = ComponentProps<"input"> & {
  label: string;
  errors?: string[];
};

// Bottom-border-only field, per mock artboard 1h — deliberately not the
// pill-shaped components/ui/Input (see specs/auth-pages.md, "Screens").
export default function AuthField({ label, errors, className, id, ...props }: AuthFieldProps) {
  const hasErrors = Boolean(errors?.length);
  const fieldId = id ?? props.name;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={fieldId}
        className="font-sans text-[11px] font-normal tracking-[0.22em] text-text-muted uppercase"
      >
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={hasErrors || undefined}
        className={cn(
          "border-0 border-b bg-transparent py-2.5 font-serif text-xl text-text outline-none transition-colors",
          hasErrors ? "border-destructive" : "border-border focus:border-primary",
          className
        )}
        {...props}
      />
      {hasErrors && (
        <ul className="flex flex-col gap-0.5">
          {errors!.map((message) => (
            <li key={message} className="font-sans text-xs text-destructive">
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
