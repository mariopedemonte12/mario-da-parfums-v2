"""Unit tests for main.py's exit-code contract, with a fake orchestrator and a
fake psycopg2 connection so no real database is needed. Spec point 9: "exit
code 0 cuando failed=0, != 0 cuando failed>0".
"""

import pytest

import priceGenerator.main as main_module
from priceGenerator.models import RunOutcome


class FakeConnection:
    def __init__(self):
        self.autocommit = None
        self.closed = False

    def close(self):
        self.closed = True


class FakeOrchestrator:
    def __init__(self, outcome, **_collaborators):
        self._outcome = outcome

    def run(self):
        return self._outcome


def _patch_common(monkeypatch, outcome, database_url="postgresql://u:p@host:5432/db"):
    connection = FakeConnection()
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    monkeypatch.setattr(main_module.psycopg2, "connect", lambda _url: connection)
    monkeypatch.setattr(
        main_module,
        "PriceSyncOrchestrator",
        lambda **kwargs: FakeOrchestrator(outcome, **kwargs),
    )
    return connection


def test_main_returns_zero_when_no_listings_failed(monkeypatch):
    _patch_common(
        monkeypatch,
        RunOutcome(vendors_ensured=5, listings_created=10, listings_updated=0, listings_failed=0),
    )

    assert main_module.main() == 0


def test_main_returns_nonzero_when_any_listing_failed(monkeypatch):
    _patch_common(
        monkeypatch,
        RunOutcome(vendors_ensured=5, listings_created=9, listings_updated=0, listings_failed=1),
    )

    assert main_module.main() != 0


def test_main_raises_when_database_url_is_missing(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValueError):
        main_module.main()


def test_main_disables_autocommit_so_repositories_control_their_own_transactions(monkeypatch):
    """priceGenerator/CLAUDE.md: repositories commit/rollback per listing
    themselves (see listing_repository.py's explicit rollback) -- that only
    works if the connection isn't already in autocommit mode.
    """
    connection = _patch_common(
        monkeypatch,
        RunOutcome(vendors_ensured=0, listings_created=0, listings_updated=0, listings_failed=0),
    )

    main_module.main()

    assert connection.autocommit is False
