# fragranticaScraper — package guidelines

See the repo-root [`CLAUDE.md`](../CLAUDE.md) for monorepo-wide worktree/spec/
testing-session conventions — this file only covers stack-specific conventions for
this package. Behavior and business rules for what this script does live in
[`specs/fragrantica-scraper.md`](../specs/fragrantica-scraper.md); this file is
architecture/coding conventions, not the spec.

## Stack and footprint

- **Python, `psycopg2` (raw SQL, no ORM).** No SQLAlchemy, no Drizzle-equivalent,
  no query builder — plain parameterized SQL strings executed through
  `cursor.execute(sql, params)`. Always parameterize; never build SQL with
  f-strings/`%`-formatting, even though inputs come from a scraper rather than an
  HTTP request — scraped strings (descriptions, names) are still external,
  untrusted content.
- **Lightweight by design.** This is a small standalone script, not a service — no
  web framework, no task queue, no scraping framework (e.g. Scrapy). Keep the
  dependency list short: an HTTP client (`requests` or `httpx`), an HTML parser
  (`selectolax` is a good default for a lightweight, fast parse; `BeautifulSoup` +
  `lxml` is a fine alternative if its API ergonomics matter more than footprint),
  and `psycopg2-binary` (simplest install path for a script — the usual
  "don't use the binary wheel in production services" caveat doesn't apply here,
  since this isn't a long-lived service process).
- **Config via environment variables**, not hardcoded values: DB connection string,
  Fragrantica base URL, request delay/rate-limit settings, log level. No secrets in
  code or committed files.

## Architecture — three objects, one job each

Per the repo-root convention (constructor injection, no service locators) and to
keep each piece independently testable:

### 1. `FragranticaScraper` — scraping and parsing only

- Owns HTTP fetching (with retry/backoff on transient failures — timeouts, 429,
  5xx) and HTML parsing.
- Produces plain data — a `ScrapedFragrance` dataclass (`name`, `brand`,
  `concentration`, `description`, `image_url`) — one per perfume found. No
  knowledge of the database, `psycopg2`, or SQL.
- Owns request pacing (a configurable delay between requests) and a descriptive
  `User-Agent` — being a considerate scraper is what keeps the weekly run viable
  over time.
- Owns the `imageUrl` shape validation described in the spec (http(s) + image
  extension) before yielding a record — mirror the same rule the backend enforces
  in `is-image-url.validator.ts`, so a record this class yields is never a URL the
  backend's own CRUD would have rejected.
- A single perfume page failing to fetch/parse must not raise past this class in a
  way that kills the whole run — it should be caught here (or surfaced as a
  per-item result) and passed up to the orchestrator to log and skip, per the
  spec's "one bad page doesn't abort the run" rule.

### 2. `FragranceRepository` — the database adapter

- The only class that imports `psycopg2` or writes SQL. Wraps a single connection
  (or a connection factory) and exposes narrow, SQL-only methods — e.g.
  `find_by_name(name) -> FragranceRow | None`, `upsert(record) -> UpsertResult`.
  Prefer a single `INSERT ... ON CONFLICT (name) DO UPDATE ...` statement for the
  upsert (Postgres does this natively and atomically) over a read-then-branch
  round trip — simpler and race-free.
- No knowledge of HTTP, HTML, or Fragrantica. No business judgment about *when* to
  insert vs. update beyond the `ON CONFLICT` — that's a DB-level detail, not a
  decision this class makes.
- Must match `backend/src/database/schema/fragrance.schema.ts` exactly — table
  `fragrances`, columns `id` (`uuid`, DB-generated default — let Postgres assign it
  on `INSERT`, don't generate a UUID client-side), `name`, `brand`,
  `concentration`, `description`, `image_url` (note: physical column is
  `image_url`, not `imageUrl`), `created_at`, `updated_at`. There is no DB trigger
  bumping `updated_at` on this table (unlike `vendors.updates_at`, which has
  Drizzle's `$onUpdateFn` — that's JS-side logic this script doesn't run) — the
  `UPDATE` branch of the upsert must set `updated_at = now()` explicitly.
- Never touches `vendors` or `listings` — single responsibility is the `fragrances`
  table only.
- Use a context manager (`with psycopg2.connect(...) as conn:` /
  `with conn.cursor() as cur:`) for connection/cursor lifecycle. Commit per
  fragrance (one `upsert()` = one transaction) rather than one giant transaction
  for the whole catalog — a failure on fragrance #4000 shouldn't roll back the
  3999 that already succeeded, matching the spec's partial-success requirement.

### 3. Orchestrator (`CatalogSyncOrchestrator`) — coordinates the run

- Takes a `FragranticaScraper` and a `FragranceRepository` as constructor
  arguments (dependency injection — never instantiated internally), so both can be
  swapped for test doubles without touching this class.
- Owns the run loop: iterate what the scraper yields, call
  `repository.upsert(record)` per item, catch and log any per-item exception
  without stopping the loop, and tally outcomes (created / updated / discarded /
  failed, with a reason for each non-success).
- Owns the run's entrypoint (a `run()` method) and the end-of-run summary/log
  required by the spec. This is the only class a CLI entrypoint (`main.py`) needs
  to call.
- Applies the spec's field-completeness rule (discard a record missing `name` or
  `brand` before it ever reaches the repository) — this is orchestration/business
  logic, not a DB concern or a scraping concern, so it belongs here rather than in
  either of the other two classes.

## Suggested layout

```
fragranticaScraper/
  CLAUDE.md            # this file
  main.py              # CLI entrypoint: build scraper + repository, run orchestrator
  scraper.py           # FragranticaScraper
  repository.py        # FragranceRepository
  orchestrator.py       # CatalogSyncOrchestrator
  models.py            # ScrapedFragrance dataclass, small result types
  config.py            # env var loading (DB url, rate limit, base url, log level)
  requirements.txt
```

## Logging

- One line per fragrance processed with its outcome (created/updated/
  discarded/failed) plus a reason on anything other than success.
- One summary line at the end of the run (counts per outcome). This runs
  unattended on a weekly cadence — the log is the only way anyone finds out a run
  went wrong.

## Testing seams

Don't write the tests in this session — per the repo-root convention, a feature's
own tests are written in a separate testing session (see the root `testing`
skill). What this architecture buys for that later session:

- `FragranticaScraper` can be tested against saved HTML fixtures, no live network.
- `FragranceRepository` can be tested against a real/test Postgres instance (or an
  in-test transaction rolled back at the end) — it never needs a fake, since it's
  a thin, mechanical SQL layer.
- `CatalogSyncOrchestrator` can be tested with a fake scraper (yields canned
  `ScrapedFragrance` records, including deliberately incomplete ones) and a fake
  repository (records calls, optionally raises to test the "one bad item doesn't
  abort the run" rule) — no network, no DB, for the orchestration logic itself.
