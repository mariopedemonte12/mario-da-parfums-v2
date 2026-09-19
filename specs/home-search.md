# home-search — hero + search results on `/`

## Purpose

Implement the landing page (`/`) against artboards **1a** (hero, "Brisa"),
**1c** (search results state) and **1i** (mobile hero) of
`frontend/designGuidelines/Mario da Parfums.dc.html`. The page is a single
client component that swaps between two states: a centered hero with a
free-text search pill, and — once a search is submitted — a results panel
built on the shared `emerge` reveal (`lib/motion.ts`).

This replaces `frontend/src/app/page.tsx` entirely (it was an unrelated
placeholder, not a cut-down version of the mock).

## Search contract

- **Semantic search**: `GET {NEXT_PUBLIC_QUERY_API_URL}/search?q=<text>&top_k=<n>`
  (`similarityServer/app.py`) → `{ results: [{ name, score }, ...] }`,
  already sorted by descending cosine similarity (approximate, HNSW — see
  `specs/perfume-similarity-search.md`). This response carries no id, brand,
  or image — only `name` + `score`.
- **Resolution**: each `name` is resolved against
  `GET {NEXT_PUBLIC_BACKEND_API_URL}/fragrances?name=<name>&limit=50`
  (`fragrances-public-read`). `name` on `FindFragranceDto` is a
  case-insensitive **contains** filter, not exact match, so the frontend
  filters the returned page client-side for the entry whose `name` is
  exactly equal (case-insensitive, trimmed) to the `/search` result's name.
  `limit=50` is used instead of the default 20 to reduce the chance the
  exact match falls on a page we don't fetch (see "Out of scope" for the
  residual risk).
- **Affinity %**: `Math.round(score * 100)` from the `/search` result — no
  separate number is invented. `score` is a coefficient in `[0, 1]`.
- `top_k` requested is **4** — one protagonist + up to three secondary
  results, matching 1c's fixed layout (one large card + a list of three).
- **Submit-triggered, not live-as-you-type.** Unlike `/fragrances`'s
  debounced contains-filter, semantic search runs an embedding query per
  request — it fires only on explicit submit (Enter or the search button),
  or when a suggestion chip is clicked. There is no debounce here because
  there is no continuous typing trigger to debounce.
- Result ordering is preserved as returned by `/search` (already
  descending); the frontend does not re-sort. If a higher-ranked result
  fails to resolve (see below) it is dropped and does not "hold a slot" —
  the protagonist is simply the highest-ranked *resolved* match.

## States

`idle → loading → success | empty | error`, driven by one hook
(`features/search/hooks/useFragranceSearch.ts`). `idle` renders the hero
(1a/1i); every other state renders the results panel (1c), which always
shows the submitted query (as a quote) and a "← Otra búsqueda" control that
resets straight back to `idle` (a fresh, empty hero — no carried-over input
text) from any of the four states.

- **loading**: shown immediately on submit, before either network call
  resolves.
- **success**: at least one `/search` result resolved to a real fragrance.
  Renders the protagonist (highest-affinity resolved match) + up to three
  secondary results, with the `emerge` stagger reveal.
- **empty**: `/search` returned zero results, *or* none of the returned
  names resolved to a fragrance. Both collapse to the same state — from the
  user's perspective there's nothing to show either way. Sensory copy, not
  "no results found".
- **error**: either HTTP call rejected (network failure, non-2xx — e.g. the
  semantic search service returns `503` while its index isn't ready yet).
  Offers a retry that re-runs the same query.

## Content mapping — mock → real data

The mock's 1c protagonist/secondary cards show fields the platform doesn't
have; each is substituted with real `ResponseFragranceDto` data instead of
being invented:

| Mock field | Shown instead | Why |
|---|---|---|
| Note tags (`té verde`, `cedro`, ...) | `olfactoryFamily`, `brand`, `longevity` (whichever are non-null) as pill tags | No structured notes exist anywhere in the project (same constraint `fragrance-detail`'s spec documents for the pyramid). These are real, existing fields. |
| Price + volume (`$ 89.000 · 50 ml`) | Not shown | Price lives on `listings`, not `fragrances`; joining it in is explicitly out of scope for this feature (same cut `fragrance-catalog` makes for its card grid). |
| Product photography | `BottlePlaceholder` (new `components/ui/` primitive, the mock's diagonal-stripe placeholder) | `imageUrl` is never rendered as a real image anywhere yet per `frontend/CLAUDE.md` — "keep this placeholder treatment... until real photography exists." Applies even when `imageUrl` is non-null. |
| "Ver perfume" / "Añadir" buttons | "Ver perfume" only, linking to `/fragrances/:id` | No cart/checkout exists (`platform-spec.md` §6); the route itself is built by the parallel `fragrance-detail` worktree, this just links to it. |

## Edge cases

- **Empty/whitespace-only query submitted**: no request is sent (the submit
  button is disabled while the field is empty/whitespace).
- **Suggestion chips** (mock's "una tarde de lluvia en Kioto" / "cuero y
  biblioteca" / "higo fresco, mar", shortened on mobile): clicking one fills
  the field and immediately submits that query — they are example scenes,
  not just placeholder text.
- **Resolution race / stale name**: if `/search` names a fragrance that no
  longer exists in `fragrances` (deleted between the importer's last sync
  and now), that single result is silently dropped from `matches`, it does
  not fail the whole search.
- **Fewer than 4 resolvable results**: renders whatever resolved (e.g. a
  protagonist with zero secondary results is valid, not an error).
- **Retry**: re-runs `search()` with the last submitted query, going through
  `loading` again.

## Responsive (1i)

One component, not a separate route — Tailwind breakpoints only:

- Hero heading 48px → 76px, eyebrow 11px → 13px, search pill 58px → 68px
  tall at `md:`.
- Submit control is an icon-only circular arrow button below `md:`, a
  labeled pill button ("Buscar") at `md:` and above.
- Results panel: single column (protagonist stacked above the secondary
  list) below `md:`, the mock's two-column grid at `md:` and above.

## Visual integrity of the protagonist card

- The protagonist's text block (affinity, name, description, tags, CTA) is
  never covered, overlapped or clipped by a decorative element (the arched
  bottle illustration, wind lines, favorite heart), at any supported
  viewport width (from 390px mobile up to wide desktop) and for any
  description length, including very long ones.
- The illustration and the text block occupy separate, non-intersecting
  areas of the card; the description's first character is always fully
  visible.

## Out of scope (this iteration)

- Combining results with `listings` price data (see table above).
- A relevance/similarity threshold on `/search` results — the service
  always returns its nearest `top_k` neighbors regardless of how weak the
  match is; there is no "too dissimilar, treat as no match" cutoff. Revisit
  if this reads as false positives in testing.
- The residual risk that an exact-name match sits outside the first 50
  contains-matches for a very generic query name — not addressed beyond
  raising `limit` to 50 (see "Resolution" above).
- Any change to `/fragrances` (catalog) or `/fragrances/:id` (detail) —
  those are the parallel `fragrance-catalog`/`fragrance-detail` worktrees.
  This feature only fixes `features/fragrances/types/fragrance.types.ts`
  (was `{ id: number; name; price }`, didn't match
  `ResponseFragranceDto` at all) and the one line of
  `FragranceCard.tsx` that broke as a direct result of that type fix
  (`fragrance.price` doesn't exist) — not a redesign of the catalog card.
- Chatbot/Sensei widget (1d) — separate `chatbot-widget` worktree.
