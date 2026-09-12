"""Tests against the REAL sentence-transformers model (default_encoder()).

Every other test file in this suite injects a fake encoder, per the package's
testing seams -- this file is the deliberate, isolated exception: it exists
specifically to validate the one precondition the rest of the suite cannot
touch without the real model: default_encoder() must return unit-normalized
vectors, because PerfumeSimilarityIndex's HNSW graph is built in inner-product
space (see NOTES.md's "Cosine via inner product") and only ranks like cosine
similarity when that holds. There is currently no runtime check for this
inside similarity.py -- it's an unvalidated precondition, so this is the only
thing standing between a regression here and silently wrong search rankings.

Marked `real_model` and excluded from the default run (see pytest.ini) since
it instantiates torch + the actual model -- slower and, if the model were
ever NOT already cached locally, would need a network download. Run explicitly
with: pytest -m real_model tests/test_default_encoder.py
"""

import numpy as np
import pytest

from perfumeCatalogImporter.similarity import PerfumeSimilarityIndex, default_encoder

pytestmark = pytest.mark.real_model

# Small synthetic corpus in the same style as this project's synthetic
# descriptions (see description_generator.py) -- never real editorial text.
_SYNTHETIC_CORPUS = [
    ("Aurora Floral", "un perfume floral con notas de rosa y jazmin, ideal para el dia"),
    ("Bosque Ambar", "una fragancia amaderizada con notas de sandalo y ambar, calida y envolvente"),
    ("Brisa Citrica", "un aroma citrico y fresco con notas de limon y bergamota, energizante"),
    ("Noche Especiada", "un perfume especiado con notas de canela y pimienta, intenso y calido"),
]


@pytest.fixture(scope="module")
def real_encoder():
    return default_encoder()


def test_default_encoder_returns_unit_normalized_vectors(real_encoder):
    """Directly validates the normalize_embeddings=True precondition.

    This is what kills the normalize_embeddings=True->False mutation in
    default_encoder() that every other (fake-encoder) test in this suite is
    structurally unable to catch.
    """
    vectors = real_encoder([description for _, description in _SYNTHETIC_CORPUS])

    norms = np.linalg.norm(vectors, axis=1)
    assert norms == pytest.approx(np.ones(len(_SYNTHETIC_CORPUS)), abs=1e-4)


def test_search_with_real_encoder_returns_exact_description_as_top_match(real_encoder):
    """Model-agnostic sanity check: searching for a fragrance's own
    description verbatim must return that fragrance first. This holds for any
    correctly unit-normalized encoder (self-similarity is always the maximum
    possible cosine similarity, 1.0) -- it does not assert anything about the
    real model's semantic quality, only that the wiring (encode -> HNSW ->
    ranking) still behaves as specified end-to-end with the real model.
    """
    index = PerfumeSimilarityIndex(encode=real_encoder)
    index.build(_SYNTHETIC_CORPUS)

    for name, description in _SYNTHETIC_CORPUS:
        top_name, top_score = index.search(description, top_k=1)[0]
        assert top_name == name
        assert top_score == pytest.approx(1.0, abs=1e-3)
