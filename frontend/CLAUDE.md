@AGENTS.md

# Frontend (Next.js) guidelines

See the repo-root [`CLAUDE.md`](../CLAUDE.md) for the monorepo-wide worktree/testing-session/module-documentation rules — this file only covers stack-specific conventions for `frontend/`.

Stack: Next.js 16 (App Router, React 19, React Compiler enabled), TypeScript, Tailwind CSS v4, pnpm. This app is a pure consumer of three independent services — no BFF layer, the wrappers in `lib/api` and `lib/ws` are the only integration point:

- **backend** (NestJS REST API) — `NEXT_PUBLIC_BACKEND_API_URL`
- **similarityServer** semantic search service (FastAPI `/search`, see `specs/perfume-similarity-search.md`) — `NEXT_PUBLIC_QUERY_API_URL`
- **chatbot** (WebSocket agent server, see `specs/chatbot-server.md` for the protocol) — `NEXT_PUBLIC_CHATBOT_WS_URL`

## Visual reference — mockups are mandatory

`designGuidelines/Mario da Parfums.dc.html` (a Claude Design canvas) is the **single source of truth for this app's visual design**. Before building or restyling any screen, open the relevant artboard and match it — spacing, type pairing, motion, shape language included, not just color. Don't freehand a divergent style when a comparable pattern already exists there; when a screen genuinely isn't covered, extend the canvas first (edit the `.dc.html` file, or use the `design` skill to add a new artboard to it) using the primitives below, agree it with the user, and only then implement in code.

**Canonical screens** (artboard id → route). Where the mock offered alternatives for the same screen, the chosen direction is noted — the rejected alternatives stay in the file for reference only, they are not to be implemented:

| Artboard | Screen | Route | Status |
|---|---|---|---|
| **1a** "Brisa" | Landing / home | `/` | **Canonical** — light, centered pill search |
| 1b "Corriente", hybrid | Landing alternatives | — | Rejected, kept in the canvas for reference only |
| 1c | Search results state | `/` (post-search) or `/fragrances?q=` | Builds on top of 1a |
| 1d | Chatbot panel + "Sensei" | floating widget, all routes | Panel + idle mascot |
| 1e | Catalog, sidebar filters | `/fragrances` | Replaces the current bare listing page |
| 1f | Product detail, olfactory pyramid | `/fragrances/[id]` | |
| 1g | User profile, olfactory "estela" | `/profile` (or `/me`) | |
| 1h | Login / register, split panel | `/login`, `/register` | |
| 1i | Mobile landing | — | Responsive behavior of `/`, not a separate route |

**Design language extracted from the mock** — treat these as rules, not just something to eyeball from the file:

- **Typography**: `Cormorant Garamond` (serif, italic used freely) for headings, prices, quotes, display copy; `Jost` (sans) for nav, buttons, body copy, and micro-labels. Micro-labels/eyebrows are Jost, uppercase, `letter-spacing` ~0.14–0.28em, 11–13px. This **replaces** the Geist/Geist Mono currently wired in `app/layout.tsx` — swap the `next/font/google` calls to Cormorant Garamond + Jost when building real screens.
- **Color**: the mock's hex values map 1:1 onto the existing tokens in `app/globals.css` — `#fff6e0`→`background`, `#d8d9da`→`surface`/`border`, `#61677a`→`secondary`/`text-muted`, `#272829`→`primary`/`text`. No new tokens needed for what the mock currently shows.
- **Shape**: pill radius (`999px`) on every input, button, and tag chip; 1px `border-border` hairlines elsewhere. Product bottles are rendered as a rounded diagonal-striped placeholder (`repeating-linear-gradient(135deg, surface ..., ...)`) until real photography exists — keep this placeholder treatment, don't invent a different one per screen.
- **"Wind" motif**: thin animated flowing SVG line-strokes in the secondary color, used as ambient texture on nav dividers, hero backgrounds, card corners, and footers across almost every screen. Build this once as a shared component (e.g. `components/ui/WindLines.tsx`), parameterized by size/opacity/stroke, instead of copy-pasting the inline SVG per screen.
- **Reveal animation**: content that responds to an action (search results, profile stats) animates in with a staggered slide-in-from-right + fade (`emerge` pattern in the mock: ~1.2s `cubic-bezier(.2,.7,.2,1)`, ~200ms stagger per child). Implement as a shared `motion` variant in `lib/motion.ts`, reused anywhere this pattern applies — not a one-off per screen.
- **"Sensei" mascot**: a sumi-e ink-brush character tied to the chatbot feature, with a breathing idle animation and a 3-dot pulsing typing indicator. The mock's SVG is explicitly a placeholder sketch ("boceto · ilustración final por encargo") — build the animation/behavior around it now, swap the art asset later without touching layout or motion logic.
- **Voice**: Spanish, sensory/poetic micro-copy ("una tarde de lluvia en Kioto", "el viento trae el perfume") — carry this tone into placeholders, empty states, and CTAs; avoid generic e-commerce copy.

**Known divergences to fix when touched** (current example code predates the mock):

- `app/layout.tsx` loads Geist/Geist Mono, not Cormorant Garamond/Jost.
- `features/layout/components/Navbar.tsx` uses a solid dark `bg-primary` bar; 1a's nav sits directly on the light background with no fill.

## Layout

```
src/
  app/                          # routes only (App Router) — no business logic, compose feature components
  features/
    <feature>/
      api/          <feature>.api.ts      # calls through lib/api clients, one function per endpoint
      types/        <feature>.types.ts    # PascalCase types for this feature's domain
      hooks/        use<Thing>.ts         # .ts unless the hook itself returns JSX — then .tsx
      components/   <Component>.tsx       # feature-specific, default export, PascalCase filename
      styles/                              # only if a feature needs styling beyond Tailwind utilities (rare)
    common/                       # cross-feature hooks/components with no domain of their own (e.g. useDebounce)
    layout/                       # site chrome shared by every route (Navbar, Footer)
  components/
    ui/                          # shadcn/ui primitives (Button, Card, Dialog, Input, ...) — see "Design system"
  lib/
    api/            client.ts, clients.ts  # generic HTTP client factory + one instance per backend service
    ws/             client.ts               # WebSocket client wrapper for the chatbot server, mirrors lib/api's shape
    utils.ts                                # cn() (clsx + tailwind-merge) and other framework-agnostic helpers
```

- **`features/`** owns everything specific to one domain (fragrances, auth, favorites, listings, semantic-search, chatbot-widget, ...). A feature never reaches into another feature's internals — if two features need the same thing, it isn't feature-specific: move it to `features/common`, `features/layout`, `lib`, or `components/ui`, whichever matches.
- **`lib/`** only holds thin wrappers around external libraries/protocols (the `fetch` HTTP client, the WebSocket client, small framework-agnostic helpers). No feature/business logic, no UI.
- **`components/ui/`** only holds generic, feature-agnostic design-system primitives (added via shadcn, then themed to our tokens). If a component knows about a `Fragrance`, a `Listing`, or a chat message, it belongs in that feature's `components/`, not here.
- **`app/`** stays route-only: a page composes feature components/hooks, it doesn't contain fetch calls or business logic itself (see `app/fragrances/page.tsx` for the target shape).

## Conventions

- **Naming**: types are PascalCase (`Fragrance`, not `user` — `features/auth/types/user.types.ts` predates this rule, fix it next time that file is touched). Files: `*.api.ts`, `*.types.ts`, `use*.ts`/`.tsx`, components `PascalCase.tsx`.
- **Exports**: components default-export; hooks and api functions named-export — matches every existing feature.
- **Data fetching**: a client component (`"use client"`) calls a hook from `features/<feature>/hooks`, which calls a function from `features/<feature>/api`, which calls `backendApi`/`queryApi` from `lib/api/clients`. Never call `fetch` or an api client directly from a component.
- **React Compiler is on** (`next.config.ts`): don't hand-write `useMemo`/`useCallback`/`React.memo` — only reach for them if profiling shows a specific case the compiler didn't cover.
- **No barrel files** (`index.ts` re-exports) — import directly from the file, matching the current codebase.

## Design system

Source of truth for the *visual design* is the mock (previous section); source of truth for the *color tokens* is `app/globals.css` — the `--color-*` custom properties (`background`, `surface`, `secondary`, `primary`, `text`, `text-muted`, `border`) and their `@theme` mirror, which is what exposes `bg-background`, `text-primary`, etc. as Tailwind utilities. Never hardcode a hex value in a component — add a token to `globals.css` first if one doesn't exist, then consume it as a Tailwind class.

Libraries — add each when the first component that actually needs it is built, not preemptively:

- **shadcn/ui** (Radix UI primitives + Tailwind, copied into `components/ui/` rather than pulled in as an opaque npm dependency) as the base component layer: accessible, unstyled by default, easy to retheme against our tokens. Preferred over a heavier all-in-one kit (MUI, Chakra, Ant) so `globals.css` stays the single source of truth for the palette.
- **`clsx` + `tailwind-merge`** — the `cn()` helper in `lib/utils.ts` (shadcn's standard pattern) for conditional/overridable class composition.
- **`class-variance-authority`** — for components with style variants (button intent/size, badge status, ...) instead of ad-hoc ternaries in `className`.
- **`motion`** (current package name for what was Framer Motion) — interaction/entrance animation and page/section transitions. Keep shared variants (fade/slide presets, stagger configs, easing/duration constants) in `lib/motion.ts` so features reuse the same feel instead of inventing new ones per component.
- **`lucide-react`** — icon set (shadcn's default; keeps icon weight/style consistent across the app).
- For higher-effort marketing/landing sections (hero, feature grid, testimonials, empty states): look at designer-made shadcn-compatible registries (Aceternity UI, Magic UI, Origin UI) for structure/animation ideas and adapt the snippet into `components/ui/` or the relevant feature's `components/`, retheming it to our tokens. Don't add a whole third-party component library as a dependency for one section.
- Dark mode isn't defined yet — `globals.css` only has a light palette. If/when it's needed, add the dark values as a second block in `globals.css` (`@media (prefers-color-scheme: dark)` and/or a `data-theme` override) rather than reaching for a separate theming library; Tailwind v4's `@theme` already covers it.

Responsive/animation rules:

- Mobile-first Tailwind (`className="... md:... lg:..."`); check phone width in addition to desktop for any new feature UI.
- Respect `prefers-reduced-motion` for non-essential animation (`motion`'s `useReducedMotion`, or a Tailwind `motion-reduce:` variant).
- Prefer plain CSS transitions/Tailwind utilities for simple hover/focus states; reach for `motion` when the animation needs orchestration (sequencing, gestures, layout animation, scroll-linking).

## Design workflow

`designGuidelines/Mario da Parfums.dc.html` already exists and is canonical — most feature UI work should implement *against it*, not start a fresh mockup:

1. Find the matching artboard in the canvas (table above). If it's marked canonical, implement it directly, matching type pairing, motion, and shape language, not just color.
2. If no artboard covers the screen: extend the same canvas file (via the `design` skill) with a new artboard built from the extracted design language above, agree it with the user, *then* implement.
3. Only start an entirely new canvas from scratch for work clearly outside this app's existing visual system (e.g. an unrelated micro-site) — not for ordinary new screens/features here.

Skip all of the above for minor changes to an already-shipped screen.

## New feature checklist

worktree + branch (root convention) → spec file `specs/<feature-slug>.md` (root convention, when the feature has real behavior beyond styling) → `features/<feature>/{types,api,hooks,components}` → wire into `app/` route(s) → reuse/extend `components/ui` primitives rather than one-off styling → lint (`pnpm lint`) → hand off for testing in a separate session.
