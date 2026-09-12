"""Content-based perfume search: 'a perfume that smells like X' -> candidates.

Embeds every fragrance's (synthetic) description once at build time, then
embeds a free-text query the same way and ranks candidates by cosine
similarity. See specs/perfume-catalog-import.md for scope — this is a small,
local, offline prototype (no vector DB, no hosted embeddings API), not a
production search service.
"""

from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np

_DEFAULT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

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


class PerfumeSimilarityIndex:
    """Nearest-description search over a fixed set of (name, description) pairs."""

    def __init__(self, encode: Encoder | None = None) -> None:
        self._encode = encode or default_encoder()
        self._names: list[str] = []
        self._embeddings: np.ndarray | None = None

    def build(self, records: Sequence[tuple[str, str]]) -> None:
        """records: (fragrance_name, description) pairs, one per fragrance."""
        self._names = [name for name, _ in records]
        descriptions = [description for _, description in records]
        self._embeddings = self._encode(descriptions)

    def search(self, query: str, top_k: int = 5) -> list[tuple[str, float]]:
        """Return up to top_k (fragrance_name, cosine_similarity) pairs."""
        if self._embeddings is None:
            raise RuntimeError("index not built — call build() or load() first")
        (query_embedding,) = self._encode([query])
        scores = self._embeddings @ query_embedding
        top_indices = np.argsort(-scores)[:top_k]
        return [(self._names[i], float(scores[i])) for i in top_indices]

    def save(self, path: Path | str) -> None:
        np.savez(
            path,
            names=np.array(self._names, dtype=object),
            embeddings=self._embeddings,
        )

    def load(self, path: Path | str) -> None:
        data = np.load(path, allow_pickle=True)
        self._names = list(data["names"])
        self._embeddings = data["embeddings"]
