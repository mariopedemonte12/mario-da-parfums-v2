"""Unit tests for IndexSyncService (perfumeCatalogImporter/index_sync.py).

Per specs/perfume-similarity-search.md and the package's testing seams: a fake
repository (no DB) + a real PerfumeSimilarityIndex wired to a fake encoder (no
torch/sentence-transformers). Decision table covered: whether an index file
already exists on disk x whether the DB corpus changed since -- crossed with
whether the resulting sync is saved back to disk.
"""

import logging

import pytest

from perfumeCatalogImporter.index_sync import IndexSyncService
from perfumeCatalogImporter.similarity import PerfumeSimilarityIndex


class FakeRepository:
    def __init__(self, records):
        self.records = records

    def fetch_search_corpus(self):
        return list(self.records)


def _save_calls(index, monkeypatch):
    calls = []
    original_save = index.save

    def spy_save(path):
        calls.append(path)
        original_save(path)

    monkeypatch.setattr(index, "save", spy_save)
    return calls


def test_no_existing_file_and_nonempty_corpus_builds_and_saves(fake_encoder, tmp_path, monkeypatch):
    embeddings_path = tmp_path / "embeddings.npz"
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    save_calls = _save_calls(index, monkeypatch)
    service = IndexSyncService(FakeRepository([("Rose Noire", "floral")]), index, embeddings_path)

    stats = service.ensure_up_to_date()

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (1, 0, 0, 0)
    assert len(save_calls) == 1
    assert embeddings_path.exists()


def test_existing_file_with_no_changes_is_not_resaved(fake_encoder, tmp_path, monkeypatch):
    embeddings_path = tmp_path / "embeddings.npz"
    seed_index = PerfumeSimilarityIndex(encode=fake_encoder)
    seed_index.build([("Rose Noire", "floral")])
    seed_index.save(embeddings_path)
    saved_mtime = embeddings_path.stat().st_mtime_ns

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    save_calls = _save_calls(index, monkeypatch)
    service = IndexSyncService(FakeRepository([("Rose Noire", "floral")]), index, embeddings_path)

    stats = service.ensure_up_to_date()

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 0, 1)
    assert len(save_calls) == 0
    assert embeddings_path.stat().st_mtime_ns == saved_mtime


def test_existing_file_with_a_changed_corpus_resyncs_and_saves(fake_encoder, tmp_path, monkeypatch):
    embeddings_path = tmp_path / "embeddings.npz"
    seed_index = PerfumeSimilarityIndex(encode=fake_encoder)
    seed_index.build([("Rose Noire", "floral")])
    seed_index.save(embeddings_path)
    fake_encoder.calls.clear()

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    save_calls = _save_calls(index, monkeypatch)
    service = IndexSyncService(
        FakeRepository([("Rose Noire", "floral"), ("Oak Barrel", "woody")]), index, embeddings_path
    )

    stats = service.ensure_up_to_date()

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (1, 0, 0, 1)
    assert len(save_calls) == 1
    # Only the new one was encoded -- reused embedding for the unchanged one.
    assert fake_encoder.call_count == 1
    assert fake_encoder.calls[0] == ["woody"]


def test_empty_corpus_against_prior_index_removes_everything_and_warns(fake_encoder, tmp_path, monkeypatch, caplog):
    embeddings_path = tmp_path / "embeddings.npz"
    seed_index = PerfumeSimilarityIndex(encode=fake_encoder)
    seed_index.build([("Rose Noire", "floral")])
    seed_index.save(embeddings_path)

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    save_calls = _save_calls(index, monkeypatch)
    service = IndexSyncService(FakeRepository([]), index, embeddings_path)

    with caplog.at_level(logging.WARNING):
        stats = service.ensure_up_to_date()

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 1, 0)
    assert len(save_calls) == 1
    assert any("no rows with a description" in record.message for record in caplog.records)
    assert index.search("floral") == []


def test_empty_corpus_with_no_prior_index_is_a_true_no_op(fake_encoder, tmp_path, monkeypatch):
    embeddings_path = tmp_path / "embeddings.npz"
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    save_calls = _save_calls(index, monkeypatch)
    service = IndexSyncService(FakeRepository([]), index, embeddings_path)

    stats = service.ensure_up_to_date()

    assert (stats.added, stats.updated, stats.removed, stats.unchanged) == (0, 0, 0, 0)
    assert len(save_calls) == 0
    assert not embeddings_path.exists()
