"""Unit tests for PerfumeSimilarityIndex (similarityServer/similarity.py).

Black-box against specs/perfume-similarity-search.md and NOTES.md's documented
contract: sync() encodes only new/changed descriptions in a single batch call,
drops removed names, reuses unchanged embeddings, and rebuilds the HNSW graph
only when the sync reports a real change. search() ranks by cosine similarity
(via HNSW) and is only asserted exactly here because the fake encoders below
produce well-separated vectors (NOTES.md: real-model recall is not exact, but
a small well-separated fake vector set is).

Never instantiates the real sentence-transformers encoder -- every test
injects a fake `encode` per the package's testing seams.
"""

import sys
import types

import numpy as np
import pytest
import hnswlib

from similarityServer import similarity as similarity_module
from similarityServer.similarity import PerfumeSimilarityIndex


class _CountingIndex(hnswlib.Index):
    """Wraps the real hnswlib.Index just to count how many times one gets built.

    Used to observe the spec's documented "rebuild only when something
    changed" rule without reaching into PerfumeSimilarityIndex's private
    _ann_index attribute -- this is a stated part of the contract (NOTES.md:
    "reconstruye el grafo HNSW SOLO cuando algo cambió"), not an incidental
    implementation detail.
    """

    instances = 0

    def __init__(self, *args, **kwargs):
        _CountingIndex.instances += 1
        super().__init__(*args, **kwargs)


@pytest.fixture(autouse=True)
def _reset_counting_index():
    _CountingIndex.instances = 0
    yield


@pytest.fixture
def counting_hnsw(monkeypatch):
    monkeypatch.setattr(similarity_module.hnswlib, "Index", _CountingIndex)
    return _CountingIndex


# --- default_encoder()'s contract with SentenceTransformer, without the real model ---


def test_default_encoder_calls_model_encode_with_normalize_embeddings_true(monkeypatch):
    """HNSW ranking correctness (space="ip") only equals cosine similarity when
    every embedding is unit-normalized (see NOTES.md's "Cosine via inner
    product") -- so default_encoder() passing normalize_embeddings=True to the
    real model is not a style choice, it's the one thing standing between a
    correct ranking and a silently wrong one (empirically confirmed against
    the real model in test_default_encoder.py: flipping this to False turned
    a self-search score that should be ~1.0 into 20.7).

    Rather than paying the real model's load cost (~5s just to import
    sentence_transformers/torch, before even loading a model) to catch a
    regression on this one boolean, a fake module is injected into
    sys.modules so default_encoder()'s lazy `from sentence_transformers
    import SentenceTransformer` resolves to a fake class -- this stays a fast,
    default-suite test that fails immediately if that argument regresses,
    complementing (not replacing) test_default_encoder.py's real-model proof
    of *why* it matters.
    """
    encode_calls = []

    class _FakeSentenceTransformer:
        def __init__(self, model_name):
            self.model_name = model_name

        def encode(self, texts, **kwargs):
            encode_calls.append(kwargs)
            return np.zeros((len(texts), 4))

    fake_module = types.ModuleType("sentence_transformers")
    fake_module.SentenceTransformer = _FakeSentenceTransformer
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_module)

    encode = similarity_module.default_encoder()
    encode(["a floral, woody scent"])

    assert encode_calls == [{"normalize_embeddings": True}]


# --- build() / sync() decision coverage: added / updated / removed / unchanged ---


def test_build_encodes_every_record_in_a_single_batch_call(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)

    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert fake_encoder.call_count == 1
    assert set(fake_encoder.calls[0]) == {"floral", "woody"}


def test_sync_from_empty_reports_all_added(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)

    stats = index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (2, 0, 0, 0)


def test_sync_detects_added_updated_removed_unchanged_together(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build(
        [
            ("Rose Noire", "floral"),
            ("Oak Barrel", "woody"),
            ("Citrus Burst", "citrus"),
        ]
    )
    fake_encoder.calls.clear()

    # Rose Noire: unchanged. Oak Barrel: description changed -> updated.
    # Citrus Burst: absent -> removed. Velvet Musk: new -> added.
    stats = index.sync(
        [
            ("Rose Noire", "floral"),
            ("Oak Barrel", "musky"),
            ("Velvet Musk", "smoky"),
        ]
    )

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (1, 1, 1, 1)
    # Only the changed/new descriptions go to the encoder, in one batch call.
    assert fake_encoder.call_count == 1
    assert set(fake_encoder.calls[0]) == {"musky", "smoky"}


def test_sync_removing_everything_empties_the_index(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    stats = index.sync([])

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 2, 0)
    assert index.search("floral") == []


def test_sync_with_no_changes_is_a_true_no_op(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    fake_encoder.calls.clear()

    stats = index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 0, 2)
    assert fake_encoder.call_count == 0


# --- HNSW graph is rebuilt only on a real change (spec/NOTES.md contract) ---


def test_hnsw_graph_is_rebuilt_when_sync_reports_a_change(fake_encoder, counting_hnsw):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral")])
    assert counting_hnsw.instances == 1

    index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    assert counting_hnsw.instances == 2


def test_hnsw_graph_is_not_rebuilt_on_a_no_op_sync(fake_encoder, counting_hnsw):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    assert counting_hnsw.instances == 1

    index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert counting_hnsw.instances == 1


def test_hnsw_graph_is_rebuilt_for_a_pure_update_with_no_add_or_remove(fake_encoder, counting_hnsw):
    """A changed description with nothing added or removed must still trigger
    a rebuild -- guards against `added or updated or removed` regressing to
    something like `added or (updated and removed)`, which would skip the
    rebuild whenever a description changes in isolation.
    """
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral")])
    assert counting_hnsw.instances == 1

    stats = index.sync([("Rose Noire", "woody")])

    assert (stats.added, stats.updated, stats.removed) == (0, 1, 0)
    assert counting_hnsw.instances == 2


# --- search() ---


def test_search_before_any_build_raises_runtime_error(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)

    with pytest.raises(RuntimeError):
        index.search("floral")


def test_search_on_an_empty_built_index_returns_no_results(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([])

    assert index.search("floral") == []


def test_search_default_top_k_is_five(fake_encoder):
    # A catalog bigger than 5 so the default is distinguishable from a
    # catalog-size cap (see test_search_top_k_is_capped_at_catalog_size).
    vocab_words = ["floral", "woody", "citrus", "musky", "smoky", "sweet", "fresh", "spicy"]
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([(word, word) for word in vocab_words])

    results = index.search("floral")

    assert len(results) == 5


def test_search_top_k_is_capped_at_catalog_size(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody"), ("Citrus Burst", "citrus")])

    results = index.search("floral", top_k=10)

    assert len(results) == 3


def test_search_ranks_exact_match_first_with_score_one(fake_encoder):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build(
        [
            ("Rose Noire", "floral"),
            ("Oak Barrel", "woody"),
            ("Citrus Burst", "citrus"),
            ("Velvet Musk", "musky"),
        ]
    )

    results = index.search("woody", top_k=1)

    assert results == [("Oak Barrel", pytest.approx(1.0, abs=1e-6))]


def test_sync_raises_if_encoder_returns_too_many_embeddings():
    """Contract check: encode() must return exactly one vector per input text.

    An encoder returning *too few* embeddings happens to still be caught by
    np.stack() rejecting the resulting None gaps, regardless of this check --
    so specifically an over-supplying encoder is used here, which is the case
    that only the strict zip pairing pending_indices with the encoder output
    actually catches: with strict=False the extra embedding would be silently
    dropped and sync() would succeed with a wrongly-shaped result.
    """

    def over_supplying_encoder(texts):
        vectors = [np.eye(4)[i % 4] for i in range(len(texts) + 1)]
        return np.stack(vectors)

    index = PerfumeSimilarityIndex(encode=over_supplying_encoder)

    with pytest.raises(ValueError):
        index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])


def test_search_raises_if_ann_index_returns_mismatched_label_and_distance_counts(fake_encoder):
    """Contract check on the hnswlib collaborator: knn_query is documented to
    return one distance per label. If a future hnswlib version (or a bug)
    broke that pairing, search() must fail loudly rather than silently
    mis-attribute a similarity score to the wrong fragrance name.
    """
    class _MismatchedAnnIndex:
        def set_ef(self, *_args, **_kwargs):
            pass

        def knn_query(self, *_args, **_kwargs):
            return np.array([[0, 1]]), np.array([[0.1]])

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    index._ann_index = _MismatchedAnnIndex()

    with pytest.raises(ValueError):
        index.search("floral")


def test_search_on_a_reloaded_emptied_index_never_calls_the_encoder(fake_encoder, tmp_path):
    """save() only rewrites the .hnsw sidecar when there's an in-memory graph
    (`if self._ann_index is not None`) -- so emptying a previously non-empty
    index and saving leaves a stale .hnsw file on disk. A later load() then
    picks up that stale sidecar even though the catalog is empty. search()
    must still short-circuit on an empty catalog (n == 0) without spending a
    (potentially expensive, real-model) encoder call, regardless of the
    stale/mismatched sidecar's presence.
    """
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    path = tmp_path / "embeddings.npz"
    index.save(path)
    assert path.with_suffix(".hnsw").exists()

    index.sync([])  # empties the catalog; the on-disk .hnsw is left stale
    index.save(path)
    assert path.with_suffix(".hnsw").exists(), "sidecar should still be the stale pre-empty one"

    reloaded = PerfumeSimilarityIndex(encode=fake_encoder)
    reloaded.load(path)
    fake_encoder.calls.clear()

    assert reloaded.search("floral", top_k=5) == []
    assert fake_encoder.call_count == 0


def test_search_ranks_by_cosine_similarity_for_well_separated_vectors():
    """Independent oracle: hand-build random unit vectors, compute the expected
    top-k by brute-force cosine similarity ourselves, and check the index
    (which ranks via HNSW) agrees exactly. Valid per NOTES.md: HNSW recall is
    only ~100% in general, but for a handful of vectors this well separated in
    an 8-dim space it is affirmable as exact.
    """
    rng = np.random.default_rng(42)
    names = [f"Fragrance {i}" for i in range(6)]
    raw_vectors = rng.normal(size=(6, 8))
    vectors = raw_vectors / np.linalg.norm(raw_vectors, axis=1, keepdims=True)
    raw_query = rng.normal(size=8)
    query_vector = raw_query / np.linalg.norm(raw_query)

    vector_by_text = {name: vectors[i] for i, name in enumerate(names)}
    vector_by_text["__query__"] = query_vector

    def encode(texts):
        return np.stack([vector_by_text[text] for text in texts])

    index = PerfumeSimilarityIndex(encode=encode)
    index.build(list(zip(names, names)))  # description == name, used as the vocab key

    expected_scores = vectors @ query_vector
    expected_order = [names[i] for i in np.argsort(-expected_scores)]

    results = index.search("__query__", top_k=3)

    assert [name for name, _ in results] == expected_order[:3]
    for (_, actual_score), name in zip(results, expected_order[:3]):
        expected_score = expected_scores[names.index(name)]
        assert actual_score == pytest.approx(expected_score, abs=1e-4)


# --- save() / load() ---


def test_save_and_load_round_trip_preserves_search_behavior(fake_encoder, tmp_path):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    path = tmp_path / "embeddings.npz"

    index.save(path)

    reloaded = PerfumeSimilarityIndex(encode=fake_encoder)
    reloaded.load(path)

    assert reloaded.search("floral", top_k=1) == [("Rose Noire", pytest.approx(1.0, abs=1e-6))]


def test_load_preserves_descriptions_so_reload_then_sync_is_a_no_op(fake_encoder, tmp_path):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    path = tmp_path / "embeddings.npz"
    index.save(path)
    fake_encoder.calls.clear()

    reloaded = PerfumeSimilarityIndex(encode=fake_encoder)
    reloaded.load(path)
    stats = reloaded.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 0, 2)
    assert fake_encoder.call_count == 0


def test_load_missing_hnsw_sidecar_rebuilds_graph_from_embeddings(fake_encoder, tmp_path):
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build([("Rose Noire", "floral"), ("Oak Barrel", "woody")])
    path = tmp_path / "embeddings.npz"
    index.save(path)
    ann_path = path.with_suffix(".hnsw")
    assert ann_path.exists()
    ann_path.unlink()

    reloaded = PerfumeSimilarityIndex(encode=fake_encoder)
    reloaded.load(path)

    assert reloaded.search("floral", top_k=1) == [("Rose Noire", pytest.approx(1.0, abs=1e-6))]


def test_load_index_file_without_descriptions_key_treats_every_name_as_changed(fake_encoder, tmp_path):
    """Simulates an index saved before sync()/descriptions existed (see
    similarity.py's load() docstring): the .npz has no 'descriptions' array.
    """
    path = tmp_path / "embeddings.npz"
    np.savez(
        path,
        names=np.array(["Rose Noire", "Oak Barrel"], dtype=object),
        embeddings=np.stack([np.eye(8)[0], np.eye(8)[1]]),
    )

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.load(path)
    stats = index.sync([("Rose Noire", "floral"), ("Oak Barrel", "woody")])

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 2, 0, 0)
    assert fake_encoder.call_count == 1
    assert set(fake_encoder.calls[0]) == {"floral", "woody"}
