"""Unit tests for download_dataset credential handling (no network, no kaggle)."""

import os
from pathlib import Path

import pytest

from similarityServer import download_dataset as dd


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    monkeypatch.delenv("SIMILARITY_KAGGLE_API_TOKEN", raising=False)
    monkeypatch.delenv("KAGGLE_API_TOKEN", raising=False)
    # No token file in the (fake) home directory.
    monkeypatch.setattr(dd, "_TOKEN_FILES", (tmp_path / "access_token", tmp_path / "access_token.txt"))


def test_similarity_token_is_exposed_as_the_library_variable(monkeypatch):
    monkeypatch.setenv("SIMILARITY_KAGGLE_API_TOKEN", " tok123 ")

    dd.prepare_kaggle_credentials()

    assert os.environ["KAGGLE_API_TOKEN"] == "tok123"


def test_existing_library_variable_is_not_overwritten(monkeypatch):
    monkeypatch.setenv("SIMILARITY_KAGGLE_API_TOKEN", "from-project")
    monkeypatch.setenv("KAGGLE_API_TOKEN", "already-set")

    dd.prepare_kaggle_credentials()

    assert os.environ["KAGGLE_API_TOKEN"] == "already-set"


def test_missing_token_exits_with_actionable_message():
    with pytest.raises(SystemExit) as exc:
        dd.prepare_kaggle_credentials()

    assert "SIMILARITY_KAGGLE_API_TOKEN" in str(exc.value)


def test_empty_token_counts_as_missing(monkeypatch):
    monkeypatch.setenv("SIMILARITY_KAGGLE_API_TOKEN", "")

    with pytest.raises(SystemExit):
        dd.prepare_kaggle_credentials()


def test_token_file_is_an_accepted_alternative(tmp_path):
    (tmp_path / "access_token").write_text("x")

    dd.prepare_kaggle_credentials()  # does not raise
    assert "KAGGLE_API_TOKEN" not in os.environ


def test_main_loads_root_env_then_validates_before_touching_kaggle(monkeypatch):
    order: list[str] = []
    monkeypatch.setattr(dd, "load_root_env", lambda: order.append("load"))

    def fail() -> None:
        order.append("validate")
        raise SystemExit("no token")

    monkeypatch.setattr(dd, "prepare_kaggle_credentials", fail)

    with pytest.raises(SystemExit):
        dd.main()

    assert order == ["load", "validate"]
    assert isinstance(dd.DEST_DIR, Path)
