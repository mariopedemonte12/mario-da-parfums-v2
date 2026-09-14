"""Unit tests for load_config() -- environment variables only, no real .env file, no DB."""

import pytest

from perfumeCatalogImporter.config import load_config
from perfumeCatalogImporter.dataset_source import DEFAULT_CSV_PATH


@pytest.fixture(autouse=True)
def _no_dotenv_file(monkeypatch):
    """Prevent load_config() from picking up the real gitignored .env in this
    package (it has real DATABASE_URL/Kaggle creds) -- point load_dotenv at a
    path that doesn't exist so only monkeypatched env vars are in play."""
    monkeypatch.setattr("perfumeCatalogImporter.config.load_dotenv", lambda *_args, **_kwargs: None)


def test_required_database_url_is_read_from_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.delenv("DATASET_CSV_PATH", raising=False)
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    config = load_config()

    assert config.database_url == "postgresql://u:p@host/db"


def test_missing_database_url_raises_key_error(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(KeyError):
        load_config()


def test_dataset_csv_path_defaults_when_not_set(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.delenv("DATASET_CSV_PATH", raising=False)

    config = load_config()

    assert config.dataset_csv_path == str(DEFAULT_CSV_PATH)


def test_dataset_csv_path_uses_explicit_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.setenv("DATASET_CSV_PATH", "/custom/path.csv")

    config = load_config()

    assert config.dataset_csv_path == "/custom/path.csv"


def test_log_level_defaults_to_info_when_not_set(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    config = load_config()

    assert config.log_level == "info"


def test_log_level_uses_explicit_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.setenv("LOG_LEVEL", "debug")

    config = load_config()

    assert config.log_level == "debug"
