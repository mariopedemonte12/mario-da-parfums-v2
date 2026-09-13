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
that screen's viewBox). `WindLines.tsx` doesn't reproduce every placement — it picks one
canonical instance per variant whose path count matches the CSS's `nth-child` rules exactly
(proof it's the "full" set the animation was authored for): the hero background's 4-path set
for `variant="wind"` (viewBox `0 0 1280 600`), the hero search bar's 3-path set for `variant="sw"`
(viewBox `0 0 200 60`), and artboard 1a's nav-divider 2-path set for `variant="divider"`
(viewBox `0 0 1280 14`, per-path `opacity` baked into `WindPath` since the mock sets it per
path rather than once on the `<svg>`).

**Don't reuse `variant="wind"` for thin bars.** Earlier this doc said every other placement
(nav/footer dividers, chat bubble, etc.) could reuse the hero's 4-path set and let
`preserveAspectRatio="none"` squash it into whatever box the caller sizes via `className`. In
practice `Navbar`/`Footer` did exactly that — squashing the 600-unit-tall hero viewBox into a
14–16px bar (~40x non-uniform vertical scale) — and it visibly broke: the bezier curves and the
`stroke-dasharray`/`stroke-dashoffset` flow animation warp non-uniformly under that much squash,
so the lines looked like they were "cutting" instead of flowing. `preserveAspectRatio="none"`
is still fine for moderate aspect-ratio changes (that's how one `sw` instance covers every
short-flourish placement), but a viewBox authored for a ~2:1 hero box has no business being
squashed ~40x flatter. Fixed by adding the `divider` variant with its own thin-viewBox path set,
used by `Navbar.tsx`/`Footer.tsx`. Any new thin full-width placement should use `divider`, not
`wind`; if a placement needs a genuinely different aspect ratio, add a preset for it rather than
squashing an existing one further than the mock's own instances do.
