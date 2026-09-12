# perfumeCatalogImporter — notes

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

Ran via `cosmic-ray` (`perfumeCatalogImporter/cosmic-ray.toml`,
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
