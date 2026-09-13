# components/ui

## shadcn init deviated from the documented `cn()` convention

`pnpm dlx shadcn@latest init` (current CLI, "Nova" preset) no longer generates `cn()` from
`clsx`+`tailwind-merge` inline — it adds a separate `cn` npm package and has every primitive
import `cn` from `"cn"` directly, plus adds `shadcn` itself as a runtime dependency. Both
contradict `frontend/CLAUDE.md`'s documented convention (`clsx`+`tailwind-merge` cn() in
`lib/utils.ts`) and the deps the design-system task explicitly asked for. Fixed after init:
`lib/utils.ts` rewritten to the clsx+tailwind-merge version, every generated primitive's
import repointed to `@/lib/utils`, and the `cn`/`shadcn` packages removed from `package.json`.
Re-running `shadcn add <component>` will regenerate the `from "cn"` import — repeat this fix
for any new primitive.

## Retheming shadcn's color slots onto our tokens

shadcn's primitives are hardcoded to Tailwind utilities (`bg-primary`, `bg-secondary`,
`text-muted-foreground`, `bg-card`, `bg-popover`, `border-input`, `ring-ring`, ...) that don't
1:1 match our existing `--color-*` tokens (`background`/`surface`/`secondary`/`primary`/
`text`/`text-muted`/`border` — see root of `globals.css`). Our `secondary` token in particular
is a **text/stroke** color in the mock (`#61677a`, never a fill), while shadcn's "secondary"
variant expects a fill+foreground pair for a filled button/badge. Resolved by keeping our
`--color-*` tokens untouched as the source of truth and adding the *extra* slots shadcn needs
(`--primary-foreground`, `--secondary-foreground`, `--muted`, `--card`, `--popover`, `--input`,
`--ring`, ...) as derived values in `globals.css`'s `:root`/`@theme inline`, rather than
inventing new hex values. `--destructive` is the one exception — kept shadcn's default red,
since the mock has no error/danger color and one has to exist for future form validation.

## WindLines canonical paths

The mock repeats the "wind" motif with different `d` paths per placement (each hand-tuned to
that screen's viewBox). `WindLines.tsx` doesn't reproduce every placement — it picks the one
canonical instance per variant whose path count matches the CSS's `nth-child` rules exactly
(proof it's the "full" set the animation was authored for): the hero background's 4-path set
for `variant="wind"` (viewBox `0 0 1280 600`), and the hero search bar's 3-path set for
`variant="sw"` (viewBox `0 0 200 60`). Other placements (nav/footer dividers, chat bubble, etc.)
reuse these same paths — `preserveAspectRatio="none"` squashes/stretches them into whatever box
the caller sizes via `className`, without needing a `viewBox` override per usage.
