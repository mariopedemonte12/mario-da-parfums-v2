"""Unit tests for env_file.load_root_env -- see specs/single-root-env.md.

Fixtures use `*.vars` file names (the `path` seam), never a real env file.
"""

from pathlib import Path

import pytest

from similarityServer import env_file
from similarityServer.env_file import ROOT_ENV_PATH, load_root_env

KEY = "ENV_FILE_SPEC_KEY"


@pytest.fixture(autouse=True)
def _clean_key(monkeypatch):
    monkeypatch.delenv(KEY, raising=False)


def test_root_path_is_one_level_above_the_package_and_absolute():
    package_dir = Path(env_file.__file__).resolve().parent
    assert ROOT_ENV_PATH == package_dir.parent / ".env"
    assert ROOT_ENV_PATH.is_absolute()


def test_missing_file_is_not_an_error_and_loads_nothing(tmp_path):
    assert load_root_env(tmp_path / "absent.vars") is False


def test_directory_with_the_file_name_is_ignored(tmp_path):
    (tmp_path / "dir.vars").mkdir()
    assert load_root_env(tmp_path / "dir.vars") is False


def test_existing_file_is_loaded(tmp_path):
    f = tmp_path / "root.vars"
    f.write_text(f"{KEY}=from-file\n")

    assert load_root_env(f) is True

    import os

    assert os.environ[KEY] == "from-file"


def test_process_environment_wins_over_the_file(tmp_path, monkeypatch):
    f = tmp_path / "root.vars"
    f.write_text(f"{KEY}=from-file\n")
    monkeypatch.setenv(KEY, "from-process")

    load_root_env(f)

    import os

    assert os.environ[KEY] == "from-process"


def test_default_path_missing_in_docker_layout_does_not_raise(monkeypatch, tmp_path):
    # Docker: package at /app/similarityServer, so the default target is
    # /app/<file>, which does not exist.
    monkeypatch.setattr(env_file, "ROOT_ENV_PATH", tmp_path / "nothing-here.vars")
    assert load_root_env() is False
