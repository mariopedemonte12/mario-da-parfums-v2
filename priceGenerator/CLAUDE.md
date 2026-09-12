# priceGenerator — package guidelines

See the repo-root [`CLAUDE.md`](../CLAUDE.md) for monorepo-wide worktree/spec/
testing-session conventions — this file only covers stack-specific
conventions for this package. Behavior and business rules live in
[`specs/price-generator.md`](../specs/price-generator.md); this file is
architecture/coding conventions, not the spec.

Same shape as [`perfumeCatalogImporter`](../perfumeCatalogImporter/CLAUDE.md)
(one object per concern, `psycopg2` raw SQL confined to the repository
modules, dataclasses in `models.py`, an orchestrator that wires everything
together, `main.py` as the only entrypoint) — deliberately not that
package's domain: no dataset, no ML dependency, no network access at all.
This one is "muy sencillo" by spec: it invents its own input (a fixed vendor
list) and derives everything else from data already in the DB.

## Stack and footprint

- **Python, `psycopg2` (raw SQL, no ORM)** — `fragrance_reader.py`,
  `vendor_repository.py` and `listing_repository.py` are the only modules
  allowed to import `psycopg2` or write SQL. Always parameterized
  (`cursor.execute(sql, params)`), never f-strings/`%`-formatting.
- **No other dependencies.** `requirements.txt` is `psycopg2-binary` alone —
  deliberately excludes anything `perfumeCatalogImporter` needed for its
  dataset/ML work (`torch`, `kaggle`, `sentence-transformers`); this package
  has no dataset file and no model to load.
- **Config via environment variables**: `DATABASE_URL`, `LOG_LEVEL`. No
  hardcoded connection strings, no secrets in code.
- **Batch, not a daemon.** `main.py` runs one sync and exits — no scheduler,
  no cron, no long-lived process. The Dockerfile's `CMD` runs it once, same
  as invoking it locally.

## Architecture — one object per concern

### 1. `vendor_catalog.py` — the fixed fake-vendor list

A plain `list[FakeVendor]` constant, not read from any external source or env
var. Deliberately small and spec-owned — changing it is a spec edit, not a
config change (see specs/price-generator.md, "Vendors falsos").

### 2. `price_generator.py` — pure, deterministic generation

- `PriceGenerator.generate(fragrance_id, vendor_id)` returns
  `(price, size_ml, in_stock)`. No I/O, no shared state.
- Seed is `hashlib.sha256(f"{fragrance_id}:{vendor_id}")`, **never** the
  builtin `hash()` — that's randomized per-process via `PYTHONHASHSEED` and
  would silently break cross-run determinism. Each call builds its own
  `random.Random(seed)` instance — never the global `random` module, never an
  instance shared across combinations.
- Draw order inside one `Random` instance is fixed: raw price, then the
  in-stock roll. `size_ml` is *derived* from the already-rounded price
  (fixed tiers), not drawn — see the module docstring for why.
- **Rounding decision** (not obvious from the spec's numbers alone): prices
  are floored to the nearest thousand and shifted to a "990" ending
  (`34_567 -> 33_990`). At the very bottom of the stated $15.000–$150.000
  range this can land $10 below the floor (`15_000 -> 14_990`) — an accepted
  side effect of requiring both a numeric range and a "990" ending
  simultaneously; no rounding rule satisfies both exactly at the boundary.
  Picked "always round down" over "round to nearest" because that's how
  storefront psychological pricing actually works (never round up past a
  threshold).
- `build_listing_url()` / `slugify()` live here too — deterministic, no
  randomness, but tightly coupled to "what this module generates for a
  listing."

### 3. `fragrance_reader.py` / `vendor_repository.py` / `listing_repository.py`

Split by table/responsibility rather than one shared `repository.py`:
reading fragrances, ensuring + listing vendors, and upserting listings are
independent enough (and each maps to exactly one schema file) that keeping
them separate was clearer than one large adapter file.

- `VendorRepository.ensure_vendors()` is `INSERT ... ON CONFLICT (name) DO
  NOTHING` per vendor — never touches `website_url` of a vendor that already
  exists (an admin may have edited it via the vendors CRUD since).
  `list_all()` reads back **every** vendor row, not just the fake 5 — this
  schema has no `active` flag, so the spec says all vendors count (see
  "Vendors falsos" / "Fuera de alcance").
- `ListingRepository.upsert()` uses `RETURNING (xmax = 0) AS inserted` to
  tell insert from update in one round trip, conflict target
  `(vendor_id, perfume_id, size_ml)` per the schema's unique index. Commits
  per listing (not one giant transaction) and **rolls back on failure before
  re-raising** — without that rollback, a single failed statement leaves the
  connection in an aborted-transaction state and every subsequent upsert in
  the run would fail too, which would defeat the "one bad combination
  doesn't abort the run" requirement (spec, point 10).

### 4. `orchestrator.py` — `PriceSyncOrchestrator`

Takes all four collaborators (reader, two repositories, generator) plus the
fake vendor list via constructor injection. `run()`: ensure vendors, read
back *all* vendors, read all fragrances, cross-join, generate + upsert each
pair, catch-and-count per-item failures, return a `RunOutcome` tally. No SQL,
no randomness of its own — pure coordination.

## Logging

- One line per listing processed: outcome (created/updated/failed) plus
  fragrance, vendor, size, price, in_stock — same style as
  `perfumeCatalogImporter`.
- One summary line at the end with the `RunOutcome` counts.

## Testing seams

Don't write tests in this session — per the repo-root convention, a separate
testing session covers this (root `testing` skill). What this split buys that
session:

- `price_generator.py` is pure functions/a stateless class — trivially
  testable for determinism (same ids -> same output, across separate
  instances) and for the price/size/stock boundary rules, with no DB needed.
- `vendor_catalog.py` is a static list — testable by asserting its exact
  contents (5 entries, exact names/URLs) without touching a DB.
- Each repository can be tested against a real/test Postgres instance (or an
  in-test transaction rolled back at the end) independently of the others.
- `PriceSyncOrchestrator` can be tested with fakes for all four
  collaborators — no DB, no real randomness — to exercise the cross-join and
  per-item failure isolation.
