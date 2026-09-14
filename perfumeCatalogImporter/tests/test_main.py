"""Unit tests for main() -- fully mocked: no real DB connection, no real CSV read.

Everything main() touches (load_config, psycopg2.connect, CatalogSyncOrchestrator)
is patched at the perfumeCatalogImporter.main import site, so this never talks to
Postgres or the filesystem dataset.
"""

from unittest.mock import MagicMock, call

import pytest

import perfumeCatalogImporter.main as main_module
from perfumeCatalogImporter.config import ImporterConfig


@pytest.fixture
def fake_config():
    return ImporterConfig(
        database_url="postgresql://u:p@host/db",
        dataset_csv_path="/fake/perfumes.csv",
        log_level="info",
    )


@pytest.fixture(autouse=True)
def _patched(monkeypatch, fake_config):
    connection = MagicMock(name="connection")
    orchestrator_instance = MagicMock(name="orchestrator_instance")
    orchestrator_cls = MagicMock(name="CatalogSyncOrchestrator", return_value=orchestrator_instance)

    monkeypatch.setattr(main_module, "load_config", MagicMock(return_value=fake_config))
    monkeypatch.setattr(main_module.psycopg2, "connect", MagicMock(return_value=connection))
    monkeypatch.setattr(main_module, "CatalogSyncOrchestrator", orchestrator_cls)

    return {
        "connection": connection,
        "orchestrator_cls": orchestrator_cls,
        "orchestrator_instance": orchestrator_instance,
    }


def test_connects_using_config_database_url(_patched, fake_config):
    main_module.main()

    main_module.psycopg2.connect.assert_called_once_with(fake_config.database_url)


def test_wires_source_and_repository_into_orchestrator_and_runs_once(_patched, fake_config):
    main_module.main()

    orchestrator_cls = _patched["orchestrator_cls"]
    assert orchestrator_cls.call_count == 1
    source_arg, repository_arg = orchestrator_cls.call_args.args
    assert source_arg.csv_path == main_module.KaggleCatalogSource(fake_config.dataset_csv_path).csv_path
    assert repository_arg.connection is _patched["connection"]
    _patched["orchestrator_instance"].run.assert_called_once_with()


def test_closes_connection_after_successful_run(_patched):
    main_module.main()

    _patched["connection"].close.assert_called_once_with()


def test_closes_connection_even_when_orchestrator_run_raises(_patched):
    _patched["orchestrator_instance"].run.side_effect = RuntimeError("boom")

    with pytest.raises(RuntimeError):
        main_module.main()

    _patched["connection"].close.assert_called_once_with()


def test_log_level_from_config_is_applied(_patched, monkeypatch, fake_config):
    fake_config.log_level = "debug"
    basic_config = MagicMock()
    monkeypatch.setattr(main_module.logging, "basicConfig", basic_config)

    main_module.main()

    basic_config.assert_called_once_with(level="DEBUG")
