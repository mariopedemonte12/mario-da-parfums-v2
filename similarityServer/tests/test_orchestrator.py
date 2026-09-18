"""Unit tests for CatalogSyncOrchestrator.run() -- fake source and fake repository, no DB.

Decision table (per specs/perfume-catalog-import.md):

    | name present | brand present | outcome                       |
    |--------------|----------------|-------------------------------|
    | no           | no             | discarded                     |
    | no           | yes            | discarded                     |
    | yes          | no             | discarded                     |
    | yes          | yes            | reaches repository.upsert()   |

Plus the repository outcome branches (created / updated / raises), and that a
single record's failure never stops the run (per "una fila mal formada no
aborta el import completo").
"""

from similarityServer.models import CatalogFragrance, SyncOutcome, UpsertResult
from similarityServer.orchestrator import CatalogSyncOrchestrator


def _fragrance(name="Nitro Red", brand="Dumont", **overrides) -> CatalogFragrance:
    fields = dict(
        name=name,
        brand=brand,
        concentration="Eau de Parfum",
        description="a description" if name and brand else None,
        image_url=None,
        olfactory_family="Fresh Scent",
        target_audience="Male",
        longevity="Strong",
    )
    fields.update(overrides)
    return CatalogFragrance(**fields)


class FakeSource:
    def __init__(self, records: list[CatalogFragrance]) -> None:
        self._records = records

    def iter_catalog(self):
        yield from self._records


class FakeRepository:
    """Records every record passed to upsert(); outcome is scripted per-name."""

    def __init__(self, outcomes: dict[str, UpsertResult | Exception]) -> None:
        self._outcomes = outcomes
        self.upserted: list[CatalogFragrance] = []

    def upsert(self, record: CatalogFragrance) -> UpsertResult:
        self.upserted.append(record)
        outcome = self._outcomes[record.name]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class TestFieldCompletenessDecisionTable:
    def test_missing_both_name_and_brand_is_discarded_not_upserted(self):
        record = _fragrance(name=None, brand=None)
        source = FakeSource([record])
        repository = FakeRepository({})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=1, failed=0)
        assert repository.upserted == []

    def test_missing_name_only_is_discarded_not_upserted(self):
        record = _fragrance(name=None, brand="Dumont")
        source = FakeSource([record])
        repository = FakeRepository({})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=1, failed=0)
        assert repository.upserted == []

    def test_missing_brand_only_is_discarded_not_upserted(self):
        record = _fragrance(name="Nitro Red", brand=None)
        source = FakeSource([record])
        repository = FakeRepository({})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=1, failed=0)
        assert repository.upserted == []

    def test_name_and_brand_present_reaches_repository(self):
        record = _fragrance(name="Nitro Red", brand="Dumont")
        source = FakeSource([record])
        repository = FakeRepository({"Nitro Red": UpsertResult(name="Nitro Red", created=True)})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=1, updated=0, discarded=0, failed=0)
        assert repository.upserted == [record]

    def test_empty_string_name_and_brand_also_discarded(self):
        """Falsy-but-not-None counts as missing too (dataset_source normalizes blank fields to None,
        but the orchestrator's own guard is a plain truthiness check)."""
        record = _fragrance(name="", brand="")
        source = FakeSource([record])
        repository = FakeRepository({})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=1, failed=0)
        assert repository.upserted == []


class TestUpsertOutcomeBranches:
    def test_created_true_counts_as_created(self):
        record = _fragrance(name="Nitro Red")
        source = FakeSource([record])
        repository = FakeRepository({"Nitro Red": UpsertResult(name="Nitro Red", created=True)})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome.created == 1
        assert outcome.updated == 0

    def test_created_false_counts_as_updated(self):
        record = _fragrance(name="Nitro Red")
        source = FakeSource([record])
        repository = FakeRepository({"Nitro Red": UpsertResult(name="Nitro Red", created=False)})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome.created == 0
        assert outcome.updated == 1

    def test_repository_exception_counts_as_failed_and_does_not_raise(self):
        record = _fragrance(name="Nitro Red")
        source = FakeSource([record])
        repository = FakeRepository({"Nitro Red": RuntimeError("db exploded")})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=0, failed=1)


class TestPartialFailureIsolation:
    def test_one_failing_record_does_not_stop_the_rest_of_the_run(self):
        records = [
            _fragrance(name="A", brand="Brand A"),
            _fragrance(name="B", brand="Brand B"),
            _fragrance(name="C", brand="Brand C"),
        ]
        source = FakeSource(records)
        repository = FakeRepository(
            {
                "A": UpsertResult(name="A", created=True),
                "B": RuntimeError("db exploded"),
                "C": UpsertResult(name="C", created=False),
            }
        )

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=1, updated=1, discarded=0, failed=1)
        assert [r.name for r in repository.upserted] == ["A", "B", "C"]

    def test_mixed_discard_created_updated_failed_tally(self):
        records = [
            _fragrance(name=None, brand="Brand X"),  # discarded
            _fragrance(name="A", brand="Brand A"),  # created
            _fragrance(name="B", brand="Brand B"),  # updated
            _fragrance(name="C", brand="Brand C"),  # failed
        ]
        source = FakeSource(records)
        repository = FakeRepository(
            {
                "A": UpsertResult(name="A", created=True),
                "B": UpsertResult(name="B", created=False),
                "C": RuntimeError("db exploded"),
            }
        )

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=1, updated=1, discarded=1, failed=1)


class TestMatchingKeyCollisionWithinRun:
    """specs/perfume-catalog-import.md (updated 2026-09-13): the matching key
    against the DB is the composite (`brand`, `name`), not `name` alone --
    "una colisión de (`brand`, `name`) entre dos filas del dataset se loguea
    como fallo puntual, no aborta la corrida completa."

    A within-run collision is two source rows sharing the same (`brand`,
    `name`) pair with genuinely different data elsewhere -- a real case in
    the live Kaggle dataset: Al Haramain's "Amber Oud Aqua Dubai" appears
    twice with different category/target_audience/longevity (see
    data/perfumes_dataset.csv). This is deliberately NOT the same as two
    different brands sharing a `name` (e.g. "Theoreme" under Rue Broca vs.
    Afnan) -- under the composite key those are two legitimately different
    fragrances that must both succeed independently, not a collision (see
    the second test below).

    The current implementation has no collision detection at all (keyed by
    `name` or otherwise) -- every record with name+brand present reaches
    `repository.upsert()` unconditionally, so a genuine (`brand`, `name`)
    collision silently overwrites via the repository's own ON CONFLICT
    upsert, with no failure recorded, losing the first row's data while the
    run reports total success. The first test below currently FAILS against
    that implementation; it documents the gap rather than the current
    (incorrect) behavior. See the testing session's findings in NOTES.md.
    """

    def test_second_row_with_a_colliding_brand_and_name_is_not_silently_upserted_over_the_first(self):
        first = _fragrance(
            name="Amber Oud Aqua Dubai",
            brand="Al Haramain",
            olfactory_family="Fresh Amber",
            target_audience="Male",
            longevity="Medium",
        )
        second = _fragrance(
            name="Amber Oud Aqua Dubai",
            brand="Al Haramain",
            olfactory_family="Woody Aquatic",
            target_audience="Unisex",
            longevity="Medium",
        )
        source = FakeSource([first, second])
        repository = FakeRepository(
            {"Amber Oud Aqua Dubai": UpsertResult(name="Amber Oud Aqua Dubai", created=True)}
        )

        outcome = CatalogSyncOrchestrator(source, repository).run()

        # The collision must be logged as a point failure, not silently applied twice --
        # the second, colliding record must never reach the repository at all.
        assert len(repository.upserted) == 1
        assert outcome.failed >= 1

    def test_same_name_different_brand_is_not_treated_as_a_collision(self):
        """Two real, distinct fragrances that merely share a `name` (e.g.
        "Theoreme" by Rue Broca vs. by Afnan) must both reach the repository
        independently -- only a (brand, name) match is a collision, name
        alone is not. Passes today (nothing currently discriminates on
        either key), and must keep passing once the collision-detection fix
        above lands -- guards against an overzealous fix that keys on `name`
        alone instead of the composite (brand, name)."""
        first = _fragrance(name="Theoreme", brand="Rue Broca")
        second = _fragrance(name="Theoreme", brand="Afnan")
        source = FakeSource([first, second])
        repository = FakeRepository({"Theoreme": UpsertResult(name="Theoreme", created=True)})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert len(repository.upserted) == 2
        assert outcome.failed == 0


class TestEmptyCatalog:
    def test_no_records_yields_all_zero_outcome(self):
        source = FakeSource([])
        repository = FakeRepository({})

        outcome = CatalogSyncOrchestrator(source, repository).run()

        assert outcome == SyncOutcome(created=0, updated=0, discarded=0, failed=0)
