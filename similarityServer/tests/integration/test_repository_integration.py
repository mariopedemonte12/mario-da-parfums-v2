"""Integration test for FragranceRepository.fetch_search_corpus() against real Postgres.

Worth a real DB per the scope gate: the behavior under test is a real SQL
WHERE clause (excluding NULL descriptions) -- a mock of the DB call wouldn't
exercise the actual filtering. Every inserted row lives only inside an
uncommitted transaction rolled back in the db_connection fixture -- nothing is
left in the shared DB.
"""

import uuid

from similarityServer.repository import FragranceRepository


def _unique_name(label: str) -> str:
    return f"__test_similarity_search_{label}_{uuid.uuid4().hex[:8]}"


def test_fetch_search_corpus_excludes_rows_with_null_description(db_connection, insert_fragrance):
    with_description = _unique_name("with_desc")
    without_description = _unique_name("without_desc")
    insert_fragrance(with_description, description="a floral scent")
    insert_fragrance(without_description, description=None)

    corpus = FragranceRepository(db_connection).fetch_search_corpus()

    names = {name for name, _ in corpus}
    assert with_description in names
    assert without_description not in names


def test_fetch_search_corpus_returns_exact_name_and_description_pairs(db_connection, insert_fragrance):
    name = _unique_name("exact")
    insert_fragrance(name, description="a woody, smoky scent")

    corpus = FragranceRepository(db_connection).fetch_search_corpus()

    assert (name, "a woody, smoky scent") in corpus
