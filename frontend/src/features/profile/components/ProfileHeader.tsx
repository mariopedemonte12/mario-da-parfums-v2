import type { UserProfile } from "../types/profile.types";

function formatMemberSince(createdAt: string): string {
  const formatted = new Intl.DateTimeFormat("es", {
    month: "long",
    year: "numeric",
  }).format(new Date(createdAt));

  return `Miembro desde ${formatted}`;
}

export default function ProfileHeader({ profile }: { profile: UserProfile }) {
  return (
    <aside className="flex flex-col gap-6">
      <div
        aria-hidden="true"
        className="flex h-[120px] w-[120px] items-center justify-center rounded-full font-mono text-[10px] text-text-muted"
        style={{
          background:
            "repeating-linear-gradient(135deg, var(--color-surface) 0px, var(--color-surface) 5px, var(--color-background) 5px, var(--color-background) 10px)",
        }}
      >
        foto
      </div>

      <div>
        <h1 className="font-serif text-4xl leading-none">{profile.name}</h1>
        <p className="mt-1.5 text-[13px] font-light text-text-muted">
          {formatMemberSince(profile.createdAt)}
        </p>
        <p className="mt-4 text-[13px] font-light text-text-muted">
          {profile.email}
        </p>
      </div>
    </aside>
  );
}
