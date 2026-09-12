"""Unit tests for config.py -- environment-variable loading, no hardcoded values."""

import dataclasses

import pytest

from priceGenerator.config import load_config


def test_load_config_reads_database_url_and_defaults_log_level(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host:5432/db")
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    config = load_config()

    assert config.database_url == "postgresql://u:p@host:5432/db"
    assert config.log_level == "INFO"


def test_load_config_respects_explicit_log_level(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host:5432/db")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    config = load_config()

    assert config.log_level == "DEBUG"


def test_load_config_raises_when_database_url_missing(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValueError):
        load_config()


def test_load_config_raises_when_database_url_is_empty_string(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")

    with pytest.raises(ValueError):
        load_config()


def test_generator_config_is_immutable(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host:5432/db")

    config = load_config()

    with pytest.raises(dataclasses.FrozenInstanceError):
        config.database_url = "postgresql://other"
