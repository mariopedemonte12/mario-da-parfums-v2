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

### 5. `PerfumeSimilarityIndex` (`similarity.py`) — the similarity-search engine

- Takes an `encode: Callable[[Sequence[str]], np.ndarray]` in its constructor
  (dependency injection) — defaults to a real `sentence-transformers` model
  via `default_encoder()`, but tests should inject a fake, cheap encoder so
  they never need `torch` installed to exercise the ranking logic.
- `build(records)` embeds every `(name, description)` pair once (equivalent
  to `sync()` from empty); `sync(records)` brings an already-built index in
  line with a new set of records, encoding only names that are new or whose
  description changed (single batched `encode()` call for all of them,
  never one call per record), dropping names no longer present, and reusing
  the existing embedding for everything unchanged. `search(query, top_k)`
  embeds the query and ranks by **approximate** cosine similarity via an
  HNSW graph (`hnswlib`, `space="ip"` — only correct because embeddings are
  pre-normalized, see `NOTES.md`) — sub-linear query time, not the exact
  brute-force scan an earlier version of this module used.
- `save`/`load` persist the embeddings (names, descriptions, vectors) as a
  `.npz` file plus the HNSW graph itself as a sibling `.hnsw` file — no
  vector DB (see `NOTES.md` for why, and for the HNSW parameter/tuning
  rationale and what "production ready at scale" does and doesn't cover
  here).
- Has no knowledge of `CatalogFragrance`/the repository/Postgres at all — it
  only ever sees `(name, description)` string pairs, so it can be built from
  any source of those pairs, not just this package's own import pipeline.

### 6. `app.py` + `index_sync.py` + `server_config.py` — the FastAPI search server

See [`specs/perfume-similarity-search.md`](../specs/perfume-similarity-search.md)
for the full decision record. Summary:

- **`app.py`** is the FastAPI app: a `/health` check and a `/search`
  endpoint wrapping `PerfumeSimilarityIndex.search()`. Run with
  `python -m perfumeCatalogImporter.app` or
  `uvicorn perfumeCatalogImporter.app:app`. This is a separate long-running
  process from the CLI importer (`main.py`) — they share `similarity.py` and
  `repository.py` but are two different entrypoints into the same package,
  not one process doing both jobs.
- **`index_sync.py`** (`IndexSyncService`) is responsibility #1: on server
  startup, read `(name, description)` straight from `fragrances` via
  `FragranceRepository.fetch_search_corpus()`, load whatever embeddings
  index already exists on disk, `sync()` it against the DB (encoding
  anything new/changed with the sentence-transformers encoder), and save it
  back if anything changed. The DB connection is only open during this
  step — a search request never touches Postgres.
- **`server_config.py`** loads this process's own env vars (`DATABASE_URL`,
  `EMBEDDINGS_PATH`, `SIMILARITY_MODEL_NAME`, `HOST`, `PORT`, `LOG_LEVEL`).
  Deliberately not `config.ImporterConfig` — different process, different
  env surface, no shared fields worth factoring out.
- The backend NestJS API is a plain HTTP client of this service — it never
  imports `sentence-transformers` or talks to Postgres for embeddings.

## Suggested layout

```
perfumeCatalogImporter/
  CLAUDE.md               # this file
  NOTES.md                # non-obvious decisions (disk index vs pgvector, ANN scaling plan)
  main.py                 # CLI entrypoint: build source + repository, run orchestrator
  dataset_source.py       # KaggleCatalogSource
  description_generator.py # synthetic description templates
  repository.py           # FragranceRepository
  orchestrator.py         # CatalogSyncOrchestrator
  similarity.py           # PerfumeSimilarityIndex
  models.py               # CatalogFragrance dataclass, small result types
  config.py                # env var loading for the CLI importer (DB url, CSV path, log level)
  download_dataset.py      # manual Kaggle refresh, not part of the normal run
  app.py                   # FastAPI search server entrypoint
  index_sync.py            # IndexSyncService — keeps embeddings.npz in sync with the DB
  server_config.py         # env var loading for app.py
  requirements.txt
  data/
    perfumes_dataset.csv   # gitignored — run download_dataset.py to fetch it
    README.md               # dataset attribution (CC BY 4.0) — required by its license, is committed
  embeddings.npz            # gitignored — built/refreshed by index_sync.py at server startup
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
  test, not `sentence-transformers` itself. `sync()`'s add/update/remove/
  unchanged branches and its `SyncStats` counts are all exercisable this way,
  no DB or real model needed.
- `IndexSyncService` can be tested with a fake repository (returning a fixed
  `list[tuple[str, str]]`) and a real `PerfumeSimilarityIndex` wired to a fake
  encoder — no DB, no `torch`.
- `app.py`'s endpoints can be tested with FastAPI's `TestClient` against an
  app whose `lifespan` is overridden/skipped and `app.state.index` set
  directly to a pre-built fake index — no DB, no model, no real HTTP server.
