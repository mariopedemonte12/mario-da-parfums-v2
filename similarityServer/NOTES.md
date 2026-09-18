# similarityServer — notes

## How `FragranceRepository.upsert()` tells INSERT apart from UPDATE

`CatalogSyncOrchestrator.run()`'s created/updated tally needs to know, per
call, which branch of the single `INSERT ... ON CONFLICT (name) DO UPDATE`
statement fired — but Postgres's `RETURNING` clause only ever returns the
resulting row, not which branch produced it, and the tempting shortcut
(`RETURNING (xmax = 0)`, a trick that shows up in Postgres upsert blog posts)
doesn't actually work here: the tuple returned by an `ON CONFLICT DO UPDATE`
also has `xmax = 0` at RETURNING time (the *old* row version is what gets
`xmax` set to the current transaction, not the new one) — it can't
distinguish the two branches.

Instead, `upsert()` returns `RETURNING (created_at = updated_at) AS
was_insert`. This works because the `ON CONFLICT DO UPDATE` clause only sets
`updated_at = now()` on the update branch; on a fresh insert neither column
is set explicitly, so both fall back to the schema's `defaultNow()` and
evaluate to the same transaction timestamp (`now()` is stable within one
Postgres transaction). A row that has ever been updated has `updated_at` from
a *different* (later) transaction than its `created_at`, so the two only
match on insert. This is why `upsert()` commits its own transaction per call
(one `now()` per fragrance) rather than batching multiple fragrances into one
transaction — batching would make every fragrance in that transaction share
the same `now()`, and a freshly-inserted-then-updated-in-the-same-transaction
row would falsely read as an insert.

## Why the embeddings index is a flat `.npz` file, not pgvector

Considered and rejected `pgvector` for storing the embedding matrix: it adds
an extension dependency + migration to a table this package doesn't own
(`fragrances` is Drizzle-managed from `backend/`) for something a plain
`numpy.savez` already does — the whole matrix loads back into memory in one
read, no query planner, no index-build step, no extra service. Since
`app.py` never needs a *subset* of the embeddings (search always scores
against the full matrix in memory) and only one process ever reads/writes
this file, a DB-backed store buys nothing here. Revisit only if a second
process needs to read the index concurrently, or the DB itself becomes the
natural place to put it because of how it's deployed.

## Scaling the search itself: HNSW instead of brute force

`PerfumeSimilarityIndex.search()` originally did a brute-force dense matmul
against every row — O(N·d), d=384 for the current model — which was fine at
the current catalog size (~1,000 rows, sub-millisecond) but degrades
linearly with N, both in per-query latency and in the memory needed to hold
the full matrix. Since the goal is to hold up against a catalog that could
grow to hundreds of thousands or millions of fragrances, `search()` now
ranks via an **HNSW graph** (`hnswlib`) instead: approximate nearest-neighbor
search with query time that grows roughly logarithmically with N rather than
linearly, at the cost of being *approximate* (near-100% recall in practice
for this vector count/dimensionality with the chosen `M`/`ef_construction`,
but not a mathematical guarantee of the true top-k like brute force was).

- **Why HNSW specifically** (over IVF/PQ-style quantized indexes): no
  training step (IVF needs a k-means pass over representative data before
  it can index anything — awkward for a catalog that starts at ~1,000 rows
  and is expected to grow), good recall/latency out of the box, and it's an
  in-memory graph — no separate service, consistent with the "no vector DB"
  decision above.
- **Why `hnswlib`** (over `faiss`'s `IndexHNSWFlat`): it's the reference
  implementation of the algorithm, a much smaller dependency than pulling in
  all of `faiss` for one index type, and its Python API is a direct match
  for what this module needs (`add_items`, `knn_query`, `save_index`/
  `load_index`) — no ecosystem lock-in to faiss's broader index zoo we don't
  use.
- **Cosine via inner product**: the HNSW graph is built with `space="ip"`
  (inner product), which only ranks identically to cosine similarity because
  `default_encoder()` L2-normalizes every embedding
  (`normalize_embeddings=True`). If a future encoder is injected that
  doesn't normalize its output, ranking silently becomes wrong — this is a
  precondition of the class, not something it currently checks for.
- **Rebuild cost is decoupled from re-encode cost**: `sync()` still only
  calls the (expensive, model-inference-bound) encoder for names that are
  new or changed, same as before. The HNSW graph itself is only rebuilt when
  `sync()` reports a non-zero diff — a no-op sync (nothing changed in
  `fragrances` since last startup) reuses the on-disk `.hnsw` graph as-is,
  no rebuild.
- **What "production ready at scale" still doesn't mean here**: the graph
  rebuild on a changed sync is still a *full* rebuild from the current
  embedding matrix, not an incremental insert/delete against the existing
  graph — acceptable because it's a startup-time cost, not per-request, but
  worth knowing before assuming a sync with a handful of changed rows is
  cheap against a 1,000,000-row graph. `hnswlib` does support incremental
  updates (`mark_deleted` + `add_items(..., replace_deleted=True)` against
  stable integer ids) if graph-rebuild time itself ever becomes the
  bottleneck — not implemented now since it requires persisting a stable
  name→id mapping across restarts, and rebuild time hasn't been measured as
  a problem at any catalog size this project actually has.
- **Tuning knobs, no rebuild required**: `_HNSW_EF_SEARCH` (query-time
  breadth) trades recall for latency and can be raised per-deployment
  without touching the persisted graph; `_HNSW_M`/`_HNSW_EF_CONSTRUCTION`
  affect recall/memory/build-time but require a rebuild (i.e. a `sync()`
  that reports a change, or a manual `build()`) to take effect.

Two further levers, only worth reaching for past real evidence HNSW itself
is the bottleneck (extremely unlikely below millions of rows on a single
process):

1. **Halve memory**: store embeddings in `float16` instead of `float32`
   (`hnswlib` can be built against `float16`-backed data, though the
   current implementation stores `float32`) — unit-normalized embeddings
   from an already-approximate model don't need the extra precision.
2. **Shard or move to a dedicated vector engine** (Qdrant, Milvus, or
   pgvector after all) only once a single process holding one full HNSW
   graph in RAM stops being viable — e.g. multiple processes needing to
   query the same index without each holding its own copy, or a graph too
   large for one machine's memory.

## Mutation testing findings on `similarity.py` (testing session)

Ran via `cosmic-ray` (`similarityServer/cosmic-ray.toml`,
`cosmic-ray init/baseline/exec cosmic-ray.toml session.sqlite`, from within
this directory with `.venv` active) against `tests/test_similarity.py`,
`tests/test_index_sync.py`, `tests/test_app.py`. 150 mutants, final score
**25 survivors, all examined and justified below — none left unexamined.**
Findings worth recording because they're non-obvious and would otherwise look
like real gaps:

- **Local variable type annotations are never evaluated at runtime.**
  `rows: list[np.ndarray | None] = []` inside `sync()` — mutating the `|` to
  any other binary operator (`+`, `-`, `*`, ... 11 variants) survives, because
  CPython compiles a local (function-body) variable annotation's expression
  out entirely; only module/class-level annotations get evaluated (to
  populate `__annotations__`). Confirmed empirically: `np.ndarray + None`
  raises at the REPL, but the same expression inside a local annotation
  inside a function body does not. These 11 mutants, plus the analogous
  `n == 0` → `n <= 0` mutants in `search()`/`_rebuild_ann_index()` (`n` comes
  from `len(...)`, never negative, so `<= 0` and `== 0` can never differ),
  and the `labels[0]`/`distances[0]` → `labels[-1]`/`distances[-1]` mutants in
  `search()` (exactly one query is ever encoded per call, so index `0` and
  `-1` are always the same row) are equivalent mutants, not test gaps.
- **`hnswlib.Index(dim=...)`'s constructor argument is ignored once
  `load_index()` loads an existing file** — confirmed empirically, not
  documented by hnswlib. This makes `_load_ann_index`'s
  `self._embeddings.shape[1]` → `shape[0]` mutant equivalent too: whatever
  `dim` is passed at construction, a subsequent `load_index()` call restores
  the file's real dimension for querying purposes.
- One real (harmless today) latent quirk surfaced by chasing a survivor:
  `save()` only rewrites the `.hnsw` sidecar when `self._ann_index is not
  None`, so emptying a previously non-empty index and saving leaves a stale
  `.hnsw` file on disk; a later `load()` picks it up (`ann_path.exists()` is
  true) and builds an `hnswlib.Index` from it even though the catalog is now
  empty. It's harmless only because `search()` checks `n == 0` before ever
  touching that index and `k = min(top_k, 0)` always ends up `0`. Covered by
  `test_search_on_a_reloaded_emptied_index_never_calls_the_encoder` in
  `tests/test_similarity.py`.
- The three HNSW tuning constants (`_HNSW_M`, `_HNSW_EF_CONSTRUCTION`,
  `_HNSW_EF_SEARCH`) have surviving off-by-one mutants (16↔15/17, 200↔199/201,
  50↔49/51) left deliberately unkilled: per this file's "Tuning knobs, no
  rebuild required" note above, the spec never mandates their exact values —
  they're adjustable performance knobs, not a business rule — so pinning a
  test to the literal constant would test an implementation choice rather
  than the spec.
- `default_encoder()`'s `normalize_embeddings=True` → `False` mutant is
  killed two ways, deliberately kept as two separate tests rather than one:
  - `tests/test_similarity.py::test_default_encoder_calls_model_encode_with_normalize_embeddings_true`
    stubs `sys.modules["sentence_transformers"]` with a fake module before
    calling `default_encoder()`, so the real `SentenceTransformer`/torch is
    never imported (a bare `import sentence_transformers` alone costs ~5s
    here). Fast (< 0.05s), runs in the default suite and in the mutation
    command above — this is what actually keeps the mutant dead on every run.
  - `tests/test_default_encoder.py` (marked `real_model`, excluded from the
    default `pytest` run via `addopts` — run explicitly with
    `pytest -m real_model`) is the real-model proof of *why* this argument
    matters, not what catches regressions day to day: model already cached
    locally (~18s, no network). Manually flipping the flag and re-running it
    showed exactly the failure mode this file's "Cosine via inner product"
    section above warns about — a self-search score that should be ~1.0 came
    back as **20.7**, i.e. the inner-product score is no longer bounded like
    a cosine similarity at all once embeddings aren't unit-normalized.

  This precondition (encode() output must be unit-normalized) is not
  validated anywhere in `similarity.py` itself — `build()`/`sync()` would
  silently accept and index un-normalized vectors from any injected encoder.
  Deliberately **not** flagged as something `similarity.py` should defend
  against at runtime: `encode` is a constructor-injection seam for
  testability (see `CLAUDE.md`'s "one object per concern" section on this
  class), not a system boundary where untrusted data enters — `grep`ing the
  whole package confirms there is exactly one production call site
  (`app.py:49 PerfumeSimilarityIndex(encode=default_encoder(config.model_name))`),
  never varied. Per the repo-root convention ("don't add validation for
  scenarios that can't happen — only validate at system boundaries"), a
  runtime normalization check inside `sync()` would be guarding against a
  case that cannot occur today. The two tests above already pin the one path
  that matters (`default_encoder()`'s call site); if a second real caller
  with a different encoder is ever added, that change is what should carry
  its own validation, not something to pre-build speculatively now.

## Testing session: repository.upsert()/orchestrator.run()/config/main (persistence pipeline)

Covers the four modules that were `NotImplementedError` stubs before this
feature (`repository.upsert()`, `orchestrator.run()`, `config.load_config()`,
`main.main()`) plus `dataset_source.py`'s new `olfactory_family`/
`target_audience`/`longevity` fields. New test files: `test_dataset_source.py`,
`test_orchestrator.py`, `test_config.py`, `test_main.py`,
`tests/integration/test_repository_upsert_integration.py`.

- **Local Postgres was missing migration `0002_famous_colonel_america.sql`**
  (the `olfactory_family`/`target_audience`/`longevity` columns) — the
  `backend-postgres-1` container was already running via
  root `docker-compose.yml`, but nothing had run `pnpm db:migrate` against
  it since that migration was authored. Applied it
  (`DATABASE_URL=... pnpm db:migrate` from `backend/`) before any of
  `FragranceRepository`'s integration tests, or the real end-to-end
  `python -m similarityServer.main` run, could work at all — every
  `upsert()` call would otherwise fail with "column does not exist". Worth
  knowing for the next fresh environment: bringing the container up isn't
  enough, the schema migration is a separate step.

- **Confirmed spec violation, and a mid-review spec correction it exposed.**
  Original finding: running the real importer against an empty local DB gave
  `created=930 updated=73 discarded=0 failed=0` against 1003 parsed rows —
  every one of those 73 "updates" on a *fresh empty table* is really an
  intra-run `name` collision silently overwriting, not a legitimate
  re-import. Two were genuine different fragrances sharing a `name` across
  brands (`"Theoreme"` — Rue Broca vs. Afnan; `"Pour Homme EDT"` — Dolce &
  Gabbana vs. Azzaro), which is what the user flagged when this was
  reported: `name` alone was never meant to be the matching key, it should
  always have been (`brand`, `name`). **Confirmed with the user and now
  reflected in `specs/perfume-catalog-import.md`'s "Reglas de negocio"
  section (2026-09-13)** — the DB-level fix (composite `uniqueIndex` on
  `fragrances`, a new Drizzle migration, `repository.py`'s `ON CONFLICT`
  clause) is out of scope for this Python-only testing session and belongs
  to a fresh implementation session.

  That correction alone doesn't fully close the gap, though: checking the
  live dataset for `(brand, name)`-level duplicates (not just `name`) turned
  up **8 pairs that collide on the composite key too**, with genuinely
  different data in the other columns (e.g. `Al Haramain` /
  `"Amber Oud Aqua Dubai"` appears twice with different
  `category`/`target_audience`/`longevity`) — a real, still-unresolved
  ambiguity the spec's *"una colisión de (`brand`, `name`) entre dos filas
  del dataset se loguea como fallo puntual"* rule is meant to cover.
  `CatalogSyncOrchestrator.run()` has no collision detection at all today
  (on either key) — every record with `name`+`brand` present reaches
  `FragranceRepository.upsert()` unconditionally, so these 8 pairs still
  silently overwrite via `ON CONFLICT DO UPDATE` with no failure recorded,
  even after the DB-level composite-key fix lands. Captured as two tests in
  `test_orchestrator.py::TestMatchingKeyCollisionWithinRun`:
  - `test_second_row_with_a_colliding_brand_and_name_is_not_silently_upserted_over_the_first`
    — deliberately left **red**, documenting the still-open gap (application-level
    collision tracking, independent of the DB unique index).
  - `test_same_name_different_brand_is_not_treated_as_a_collision` — green today
    (nothing currently discriminates on either key, so it passes vacuously), kept
    as a guard so a future fix keys collision detection on the composite
    (`brand`, `name`) and not `name` alone, which would wrongly reject the
    Theoreme/Pour Homme EDT case the spec correction above says must succeed.

  Fixing either belongs to a future implementation session, not this testing
  session.

- **Mutation testing** (`cosmic-ray`, same process as `similarity.py` above,
  two separate configs since `cosmic-ray`'s `module-path` only takes one
  target):
  - `orchestrator.py` (`cosmic-ray-orchestrator.toml` →
    `tests/test_orchestrator.py`, baselined with the known-failing collision
    test deselected via `-k 'not colliding_brand_and_name'` so the baseline
    itself stays green): **19 mutants, 19 killed, 0 survivors.**
  - `repository.py` (`cosmic-ray-repository.toml` → both
    `tests/integration/test_repository_integration.py` and
    `tests/integration/test_repository_upsert_integration.py`, against real
    Postgres): **1 mutant, 1 killed** (`except Exception` →
    `except CosmicRayTestingException`, i.e. the exception type itself).
    Only one mutant exists at all because almost everything else in this
    file is either the multi-line SQL string (cosmic-ray's default operators
    don't mutate string literal contents) or a single `with`/`try` block with
    no comparisons/arithmetic/booleans for the standard operator set to
    target — not a gap in the test suite, a ceiling on what this particular
    file structure gives a mutation tool to work with. The SQL itself is
    exercised for real by the integration tests (insert, update, null
    columns, rollback-then-reusable-connection), just not through mutation
    coverage.
