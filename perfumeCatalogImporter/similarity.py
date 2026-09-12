"""Content-based perfume search: 'a perfume that smells like X' -> candidates.

Embeds every fragrance's (synthetic) description once, then embeds a
free-text query the same way and ranks candidates by approximate cosine
similarity via an HNSW graph (see `NOTES.md` for why HNSW and not a brute-
force scan — this is what keeps `search()` sub-linear as the catalog grows
into the hundreds of thousands/millions of rows). See
specs/perfume-catalog-import.md for how the index itself was designed, and
specs/perfume-similarity-search.md for how the FastAPI server (app.py) uses
it as a long-lived, in-memory index.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import hnswlib
import numpy as np

_DEFAULT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

# HNSW graph-construction parameters (hnswlib). M = max neighbors per node
# (higher = better recall, more memory/build time); ef_construction = search
# breadth while building (higher = better graph quality, slower build).
# These are the library's own recommended starting points and apply at any
# catalog size — see NOTES.md for the accuracy/speed knobs available at
# query time (`_HNSW_EF_SEARCH`) without rebuilding the graph.
_HNSW_M = 16
_HNSW_EF_CONSTRUCTION = 200
_HNSW_EF_SEARCH = 50

Encoder = Callable[[Sequence[str]], np.ndarray]


def default_encoder(model_name: str = _DEFAULT_MODEL_NAME) -> Encoder:
    """Wrap a local sentence-transformers model as an Encoder.

    Imported lazily so that modules/tests that inject their own `encode`
    function never need sentence-transformers (and its torch dependency)
    installed at all.
    """
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name)

    def encode(texts: Sequence[str]) -> np.ndarray:
        return np.asarray(model.encode(list(texts), normalize_embeddings=True))

    return encode


@dataclass
class SyncStats:
    """Outcome of one PerfumeSimilarityIndex.sync() call."""

    added: int
    updated: int
    removed: int
    unchanged: int


class PerfumeSimilarityIndex:
    """Nearest-description search over a set of (name, description) pairs.

    Ranking is approximate nearest-neighbor (HNSW via `hnswlib`), not exact
    brute force — a deliberate trade-off, see NOTES.md. `encode()` output
    must be unit-normalized (default_encoder() does this): the HNSW graph is
    built in inner-product space, which only ranks the same as cosine
    similarity when every vector has unit norm.
    """

    def __init__(self, encode: Encoder | None = None) -> None:
        self._encode = encode or default_encoder()
        self._names: list[str] = []
        self._descriptions: list[str] = []
        self._embeddings: np.ndarray | None = None
        self._ann_index: hnswlib.Index | None = None

    def build(self, records: Sequence[tuple[str, str]]) -> None:
        """records: (fragrance_name, description) pairs, one per fragrance.

        Equivalent to syncing from an empty index — every record is encoded.
        """
        self._names = []
        self._descriptions = []
        self._embeddings = None
        self._ann_index = None
        self.sync(records)

    def sync(self, records: Sequence[tuple[str, str]]) -> SyncStats:
        """Bring the index in line with `records`, encoding only what changed.

        A name missing from the current index (or present with a different
        description) gets encoded; a name whose description didn't change
        keeps its existing embedding; a name no longer in `records` is
        dropped. All new/changed descriptions are encoded in a single batch
        call to `encode`, not one call per record — this is what makes
        re-running this against a mostly-unchanged catalog cheap regardless
        of how large the catalog gets. Safe to call on a freshly constructed
        (empty) index too — see `build()`.

        The HNSW graph is only rebuilt from the resulting embedding matrix
        when something actually changed (added/updated/removed > 0) — a
        no-op sync (nothing changed since the last build/load/sync) leaves
        the existing graph untouched, since rebuilding it is real CPU work
        at large catalog sizes even though it's cheaper than re-encoding.
        """
        existing = dict(zip(self._names, zip(self._descriptions, range(len(self._names)), strict=True)))
        old_embeddings = self._embeddings

        new_names: list[str] = []
        new_descriptions: list[str] = []
        rows: list[np.ndarray | None] = []
        pending_indices: list[int] = []
        pending_texts: list[str] = []
        added = updated = unchanged = 0
        seen_names: set[str] = set()

        for name, description in records:
            seen_names.add(name)
            new_names.append(name)
            new_descriptions.append(description)
            prior = existing.get(name)
            if prior is None:
                added += 1
                pending_indices.append(len(rows))
                pending_texts.append(description)
                rows.append(None)
            elif prior[0] != description:
                updated += 1
                pending_indices.append(len(rows))
                pending_texts.append(description)
                rows.append(None)
            else:
                unchanged += 1
                rows.append(old_embeddings[prior[1]])

        removed = sum(1 for name in self._names if name not in seen_names)

        if pending_texts:
            fresh = self._encode(pending_texts)
            for row_index, embedding in zip(pending_indices, fresh, strict=True):
                rows[row_index] = embedding

        self._names = new_names
        self._descriptions = new_descriptions
        self._embeddings = np.stack(rows) if rows else np.empty((0, 0))

        if added or updated or removed:
            self._rebuild_ann_index()

        return SyncStats(added=added, updated=updated, removed=removed, unchanged=unchanged)

    def search(self, query: str, top_k: int = 5) -> list[tuple[str, float]]:
        """Return up to top_k (fragrance_name, approximate_cosine_similarity) pairs.

        Approximate, not exact — HNSW trades a small amount of recall for
        query time that no longer grows linearly with catalog size (see
        NOTES.md). Raise `_HNSW_EF_SEARCH` if a specific use case needs
        higher recall and can afford the extra query latency.
        """
        if self._embeddings is None:
            raise RuntimeError("index not built — call build(), sync() or load() first")
        n = len(self._names)
        if n == 0 or self._ann_index is None:
            return []

        k = min(top_k, n)
        query_embedding = self._encode([query])
        self._ann_index.set_ef(max(_HNSW_EF_SEARCH, k))
        labels, distances = self._ann_index.knn_query(query_embedding, k=k)
        # hnswlib's "ip" space distance is `1 - inner_product`; with
        # unit-normalized vectors, inner_product == cosine similarity.
        return [
            (self._names[label], float(1.0 - distance))
            for label, distance in zip(labels[0], distances[0], strict=True)
        ]

    def save(self, path: Path | str) -> None:
        path = Path(path)
        np.savez(
            path,
            names=np.array(self._names, dtype=object),
            descriptions=np.array(self._descriptions, dtype=object),
            embeddings=self._embeddings,
        )
        if self._ann_index is not None:
            self._ann_index.save_index(str(self._ann_index_path(path)))

    def load(self, path: Path | str) -> None:
        path = Path(path)
        data = np.load(path, allow_pickle=True)
        self._names = list(data["names"])
        # Older index files saved before `sync()` existed have no
        # `descriptions` array — fall back to `None` per name so the next
        # `sync()` treats every one as changed and re-encodes it, rather
        # than guessing a description that was never actually stored.
        if "descriptions" in data:
            self._descriptions = list(data["descriptions"])
        else:
            self._descriptions = [None] * len(self._names)
        self._embeddings = data["embeddings"]

        ann_path = self._ann_index_path(path)
        if ann_path.exists():
            self._load_ann_index(ann_path)
        else:
            # Index file predates the HNSW graph being persisted alongside
            # it (or it was deleted) — rebuild it from the embeddings we
            # just loaded rather than leaving search() unusable.
            self._rebuild_ann_index()

    @staticmethod
    def _ann_index_path(embeddings_path: Path) -> Path:
        return embeddings_path.with_suffix(".hnsw")

    def _rebuild_ann_index(self) -> None:
        n = len(self._names)
        if n == 0:
            self._ann_index = None
            return
        dim = self._embeddings.shape[1]
        index = hnswlib.Index(space="ip", dim=dim)
        index.init_index(max_elements=n, ef_construction=_HNSW_EF_CONSTRUCTION, M=_HNSW_M)
        index.add_items(self._embeddings, np.arange(n))
        index.set_ef(_HNSW_EF_SEARCH)
        self._ann_index = index

    def _load_ann_index(self, ann_path: Path) -> None:
        dim = self._embeddings.shape[1]
        index = hnswlib.Index(space="ip", dim=dim)
        index.load_index(str(ann_path), max_elements=len(self._names))
        index.set_ef(_HNSW_EF_SEARCH)
        self._ann_index = index
