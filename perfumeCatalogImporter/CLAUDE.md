# perfumeCatalogImporter — package guidelines

See the repo-root [`CLAUDE.md`](../CLAUDE.md) for monorepo-wide worktree/spec/
testing-session conventions — this file only covers stack-specific conventions for
this package. Behavior and business rules for what this script does live in
[`specs/perfume-catalog-import.md`](../specs/perfume-catalog-import.md); this file
is architecture/coding conventions, not the spec.

This package used to be `fragranticaScraper/`, a live HTTP scraper of
Fragrantica. It was renamed and rebuilt around a static Kaggle dataset instead —
see the spec's "Contexto y por qué cambió de scope" for why (legal risk of
continuous scraping, not a technical dead end: the old scraper worked). If you're
looking for the Cloudflare-bypass/microdata-scraping code, it's still in git
history on this path before the rename, not deleted for no reason.

## Stack and footprint

- **Python, `psycopg2` (raw SQL, no ORM).** No SQLAlchemy, no Drizzle-equivalent,
  no query builder — plain parameterized SQL strings executed through
  `cursor.execute(sql, params)`. Always parameterize; never build SQL with
  f-strings/`%`-formatting.
- **No network access at import time.** `dataset_source.py` only opens a local
  CSV — it never talks to Kaggle or anywhere else itself. That CSV is
  gitignored, not committed (real-world dataset file, not source code —
  keep it out of git history the same way model weights never belong in git
  either). `download_dataset.py` is the only thing that touches the network:
  run it once to fetch `data/perfumes_dataset.csv` before the importer can do
  anything, and again by hand whenever the upstream dataset changes.
- **`sentence-transformers` is the one heavy dependency** (pulls in `torch`),
  used only by `similarity.py` for the similarity-search feature — confirmed
  with the user (`specs/perfume-catalog-import.md`), the tradeoff of a chunkier
  install vs. depending on a paid hosted embeddings API. Nothing else in this
  package should grow dependencies at that scale.
- **Config via environment variables**, not hardcoded values: DB connection
  string, dataset CSV path, log level. No secrets in code or committed files —
  `download_dataset.py`'s Kaggle credentials live in a gitignored local `.env`
  (loaded with `python-dotenv`), never anywhere that gets committed.

## Architecture — one object per concern

Per the repo-root convention (constructor injection, no service locators) and to
keep each piece independently testable:

### 1. `KaggleCatalogSource` (`dataset_source.py`) — reads and cleans the CSV

- Owns opening `data/perfumes_dataset.csv` and turning each row into a
  `CatalogFragrance`. No knowledge of the database, `psycopg2`, or SQL.
- Owns all data-cleaning rules from the spec: dropping the leaked duplicate
  header row, stripping LLM-citation artifacts from `longevity`, normalizing
  `type` → `concentration`, normalizing `target_audience`, and the
  lowercase-only title-casing fix for `brand`/`name` (see the spec for exactly
  why it's conditional on the original string being all-lowercase).
- Delegates description text to `description_generator.py` — this class
  decides *which* cleaned fields go into a description, not *how* the
  sentence is phrased.
- A single malformed row must not raise past this class in a way that kills
  the whole run — caught and skipped, logged for the orchestrator's summary,
  same "one bad item doesn't abort the run" rule as before.

### 2. `description_generator.py` — synthetic description text

- Pure functions, no I/O. Takes already-cleaned fields (name, brand, category,
  audience, longevity, concentration) and returns a Spanish sentence built
  from a fixed set of templates.
- Deterministic per `(brand, name)` (seeded `random.Random`, not global
  `random` state) — see the spec for why: a re-import shouldn't churn
  `updated_at` on rows whose underlying data didn't change.
- Never reads or references any real editorial text (Fragrantica or
  otherwise) — the whole point of this module existing is that the
  description is fabricated, not scraped.

### 3. `FragranceRepository` (`repository.py`) — the database adapter

Unchanged from the original design — still the only class that imports
`psycopg2` or writes SQL, still a single `INSERT ... ON CONFLICT (name) DO
UPDATE ...`, still must match `backend/src/database/schema/fragrance.schema.ts`
exactly (columns `id`, `name`, `brand`, `concentration`, `description`,
`image_url`, `created_at`, `updated_at` — no DB trigger for `updated_at`, this
class sets it explicitly on the `UPDATE` branch). Never touches `vendors` or
`listings`. Commit per fragrance, not one giant transaction.

### 4. `CatalogSyncOrchestrator` (`orchestrator.py`) — coordinates one run

- Takes a `KaggleCatalogSource` and a `FragranceRepository` as constructor
  arguments (dependency injection), so both can be swapped for test doubles.
- Owns the run loop, the field-completeness rule (discard a record missing
  `name` or `brand` before it reaches the repository), and the end-of-run
  summary/log.

### 5. `PerfumeSimilarityIndex` (`similarity.py`) — the similarity-search prototype

- Takes an `encode: Callable[[Sequence[str]], np.ndarray]` in its constructor
  (dependency injection) — defaults to a real `sentence-transformers` model
  via `default_encoder()`, but tests should inject a fake, cheap encoder so
  they never need `torch` installed to exercise the ranking logic.
- `build(records)` embeds every `(name, description)` pair once;
  `search(query, top_k)` embeds the query and ranks by cosine similarity
  (embeddings are pre-normalized, so it's a plain dot product).
- `save`/`load` persist the index as a `.npz` file — no vector DB, no backend
  wiring in this phase (see the spec's "Fuera de alcance").
- Has no knowledge of `CatalogFragrance`/the repository/Postgres at all — it
  only ever sees `(name, description)` string pairs, so it can be built from
  any source of those pairs, not just this package's own import pipeline.

## Suggested layout

```
perfumeCatalogImporter/
  CLAUDE.md               # this file
  main.py                 # CLI entrypoint: build source + repository, run orchestrator
  dataset_source.py       # KaggleCatalogSource
  description_generator.py # synthetic description templates
  repository.py           # FragranceRepository
  orchestrator.py         # CatalogSyncOrchestrator
  similarity.py           # PerfumeSimilarityIndex
  models.py               # CatalogFragrance dataclass, small result types
  config.py                # env var loading (DB url, CSV path, log level)
  download_dataset.py      # manual Kaggle refresh, not part of the normal run
  requirements.txt
  data/
    perfumes_dataset.csv   # gitignored — run download_dataset.py to fetch it
    README.md               # dataset attribution (CC BY 4.0) — required by its license, is committed
```

## Logging

- One line per fragrance processed with its outcome (created/updated/
  discarded/failed) plus a reason on anything other than success.
- One summary line at the end of the run (counts per outcome).

## Testing seams

Don't write the tests in this session — per the repo-root convention, a feature's
own tests are written in a separate testing session (see the root `testing`
skill). What this architecture buys for that later session:

- `KaggleCatalogSource` can be tested against a small fixture CSV (including
  deliberately-broken rows: the leaked header, a citation-artifact
  `longevity`, mixed casing) — no network, no DB.
- `description_generator.py` is pure functions — trivial to test directly,
  including the determinism property (same inputs → same output across calls).
- `FragranceRepository` can be tested against a real/test Postgres instance (or
  an in-test transaction rolled back at the end).
- `CatalogSyncOrchestrator` can be tested with a fake source and a fake
  repository — no network, no DB, for the orchestration logic itself.
- `PerfumeSimilarityIndex` can be tested with a fake `encode` function (e.g. a
  small hand-built vocabulary → vector map) — the ranking math is what's under
  test, not `sentence-transformers` itself.
