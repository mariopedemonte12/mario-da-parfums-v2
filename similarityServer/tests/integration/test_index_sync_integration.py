"""Integration test for IndexSyncService end-to-end against real Postgres.

Worth a real DB per the scope gate: this exercises the real interaction
between FragranceRepository (real SQL) and PerfumeSimilarityIndex (real
sync/save/load against a tmp_path .npz), which a fake repository wouldn't
touch. The encoder is still fake per this session's brief -- never instantiate
sentence-transformers in tests. Fixture rows live only in an uncommitted,
rolled-back transaction (see integration/conftest.py), and the shared table
may also hold unrelated real rows from other work -- assertions only check
for presence/absence of our own fixture names, never the full result set.

Uses the `fake_encoder` fixture from tests/conftest.py (exact vectors for a
fixed vocabulary, a deterministic fallback vector for anything else) so
whatever real rows already exist in the table encode to *something* without
needing sentence-transformers, while our fixture rows (using vocabulary words
as their description) get exact, comparable vectors.
"""

import uuid

from similarityServer.index_sync import IndexSyncService
from similarityServer.repository import FragranceRepository
from similarityServer.similarity import PerfumeSimilarityIndex


def _unique_name(label: str) -> str:
    return f"__test_similarity_search_{label}_{uuid.uuid4().hex[:8]}"


def test_ensure_up_to_date_builds_index_from_real_db_rows(db_connection, insert_fragrance, tmp_path, fake_encoder):
    name = _unique_name("sync")
    insert_fragrance(name, description="floral")
    embeddings_path = tmp_path / "embeddings.npz"

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    service = IndexSyncService(FragranceRepository(db_connection), index, embeddings_path)

    stats = service.ensure_up_to_date()

    assert stats.added >= 1
    assert embeddings_path.exists()
    # Exact vocabulary match against a real DB row: the closest result to an
    # exact "floral" query should be our own fixture row, even alongside
    # whatever unrelated real rows exist (they get unrelated fallback vectors).
    top_result_name, top_result_score = index.search("floral", top_k=1)[0]
    assert top_result_name == name
    assert top_result_score > 0.99


def test_ensure_up_to_date_excludes_null_description_rows_from_the_index(
    db_connection, insert_fragrance, tmp_path, fake_encoder
):
    included = _unique_name("included")
    excluded = _unique_name("excluded")
    insert_fragrance(included, description="woody")
    insert_fragrance(excluded, description=None)
    embeddings_path = tmp_path / "embeddings.npz"

    index = PerfumeSimilarityIndex(encode=fake_encoder)
    service = IndexSyncService(FragranceRepository(db_connection), index, embeddings_path)
    service.ensure_up_to_date()

    all_names = {result_name for result_name, _ in index.search("woody", top_k=1_000_000)}
    assert included in all_names
    assert excluded not in all_names
