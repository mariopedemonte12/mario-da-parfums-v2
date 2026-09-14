import WindLines from "@/components/ui/WindLines";

type AuthSubmitButtonProps = {
  pending: boolean;
  label: string;
  pendingLabel: string;
};

export default function AuthSubmitButton({ pending, label, pendingLabel }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative h-[54px] w-full overflow-hidden rounded-full bg-primary font-sans text-[13px] tracking-[0.14em] text-primary-foreground uppercase transition-opacity disabled:opacity-60"
    >
      <span className="relative z-10">{pending ? pendingLabel : label}</span>
      <WindLines
        variant="sw"
        color="var(--color-border)"
        opacity={0.6}
        className="pointer-events-none absolute inset-y-0 right-4 w-28"
      />
    </button>
  );
}
