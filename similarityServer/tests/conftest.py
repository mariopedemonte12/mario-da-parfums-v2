"""Shared fixtures for unit tests: fake encoders, never the real sentence-transformers model."""

import numpy as np
import pytest

# Fixed orthonormal vocabulary (standard basis vectors) so cosine similarity
# between distinct words is exactly 0.0 and self-similarity is exactly 1.0 --
# ranking is then exact, not merely "approximately correct", which is what
# lets a test assert a precise expected order/score (see NOTES.md: recall is
# only guaranteed ~100% -- not exact -- for well-separated vectors like these).
_VOCAB_WORDS = ["floral", "woody", "citrus", "musky", "smoky", "sweet", "fresh", "spicy"]
_VOCAB = {word: np.eye(len(_VOCAB_WORDS))[i] for i, word in enumerate(_VOCAB_WORDS)}


def _fallback_vector(text: str) -> np.ndarray:
    """Deterministic unit vector for text outside the fixed vocabulary.

    Only used so an arbitrary/incidental query string (e.g. a BVA boundary
    value like a single "a") doesn't blow up encoding -- tests asserting on
    *ranking* always use exact _VOCAB_WORDS, never this fallback.
    """
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    vector = rng.normal(size=len(_VOCAB_WORDS))
    return vector / np.linalg.norm(vector)


class RecordingEncoder:
    """Fake Encoder over the fixed vocabulary above; records every batch it was called with.

    Text in _VOCAB_WORDS encodes to its exact basis vector, for tests that
    assert precise ranking/scores. Any other text falls back to a deterministic
    (but not meaningfully comparable) unit vector -- see _fallback_vector.
    """

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, texts):
        texts = list(texts)
        self.calls.append(texts)
        return np.stack([_VOCAB.get(text, _fallback_vector(text)) for text in texts])

    @property
    def call_count(self) -> int:
        return len(self.calls)


@pytest.fixture
def fake_encoder() -> RecordingEncoder:
    return RecordingEncoder()


@pytest.fixture
def anyio_backend() -> str:
    """Pin anyio's pytest plugin to asyncio -- trio isn't a project dependency."""
    return "asyncio"
