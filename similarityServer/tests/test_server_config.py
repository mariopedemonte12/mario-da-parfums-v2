"""Unit tests for server_config.py.

Covers both `load_mcp_mount_path` (new for specs/similarity-search-mcp.md:
"La ruta donde se monta el sub-app MCP ... es configurable con un default
razonable") and `ServerConfig`/`load_server_config` (preexisting, from
specs/perfume-similarity-search.md). The latter pair was never exercised for
real by any prior test -- tests/test_app.py always monkeypatches
load_server_config wholesale rather than calling it -- a gap mutation testing
surfaced (a removed @dataclass decorator and a corrupted env-var-file path
both survived). Adding it here since it's the same module/file as
load_mcp_mount_path.

Every test in this file gets `load_root_env` replaced with a counting no-op:
both functions under test call it before reading any environment variable, and
a developer's real repo-root env file may exist -- without this, a test's
"defaults apply" assertion would silently depend on that file not happening to
set the variable under test, rather than on a controlled fixture. Where the
env file is looked up is covered in tests/test_env_file.py.
"""

from pathlib import Path

import pytest

from similarityServer import server_config as server_config_module
from similarityServer.server_config import (
    DEFAULT_EMBEDDINGS_PATH,
    DEFAULT_MCP_MOUNT_PATH,
    DEFAULT_MODEL_NAME,
    ServerConfig,
    load_mcp_mount_path,
    load_server_config,
)

_ENV_VARS = [
    "DATABASE_URL",
    "SIMILARITY_EMBEDDINGS_PATH",
    "SIMILARITY_MODEL_NAME",
    "SIMILARITY_HOST",
    "SIMILARITY_PORT",
    "SIMILARITY_LOG_LEVEL",
    "SIMILARITY_MCP_MOUNT_PATH",
]


@pytest.fixture(autouse=True)
def isolated_env_and_dotenv(monkeypatch):
    """Clears every env var either function reads, and replaces load_root_env
    with a counting no-op so no test's outcome depends on a real,
    developer-local root env file. Returns the list of calls, for tests that
    assert on it directly."""
    for var in _ENV_VARS:
        monkeypatch.delenv(var, raising=False)

    calls: list[str] = []
    monkeypatch.setattr(server_config_module, "load_root_env", lambda: calls.append("called"))
    return calls


# --- load_mcp_mount_path ---


def test_mcp_mount_path_defaults_to_mcp_when_env_var_is_unset():
    assert load_mcp_mount_path() == DEFAULT_MCP_MOUNT_PATH == "/mcp"


def test_mcp_mount_path_honors_env_var_override(monkeypatch):
    monkeypatch.setenv("SIMILARITY_MCP_MOUNT_PATH", "/tools/similarity")

    assert load_mcp_mount_path() == "/tools/similarity"


# --- load_server_config / ServerConfig ---


def test_raises_when_database_url_is_missing():
    # DATABASE_URL has no default -- decision condition: present vs absent.
    with pytest.raises(KeyError):
        load_server_config()


def test_all_defaults_when_only_database_url_is_set(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")

    config = load_server_config()

    assert config == ServerConfig(
        database_url="postgresql://fake",
        embeddings_path=DEFAULT_EMBEDDINGS_PATH,
        model_name=DEFAULT_MODEL_NAME,
        host="0.0.0.0",
        port=8001,
        log_level="info",
    )


def test_embeddings_path_env_var_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setenv("SIMILARITY_EMBEDDINGS_PATH", "/tmp/custom/embeddings.npz")

    config = load_server_config()

    assert config.embeddings_path == Path("/tmp/custom/embeddings.npz")


def test_model_name_env_var_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setenv("SIMILARITY_MODEL_NAME", "custom-model")

    assert load_server_config().model_name == "custom-model"


def test_host_env_var_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setenv("SIMILARITY_HOST", "127.0.0.1")

    assert load_server_config().host == "127.0.0.1"


def test_port_env_var_override_is_cast_to_int(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setenv("SIMILARITY_PORT", "9999")

    config = load_server_config()

    assert config.port == 9999
    assert isinstance(config.port, int)


def test_log_level_env_var_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setenv("SIMILARITY_LOG_LEVEL", "debug")

    assert load_server_config().log_level == "debug"


def test_load_server_config_loads_the_root_env_file_once(monkeypatch, isolated_env_and_dotenv):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")

    load_server_config()

    assert isolated_env_and_dotenv == ["called"]


def test_load_mcp_mount_path_loads_the_root_env_file_once(isolated_env_and_dotenv):
    load_mcp_mount_path()

    assert isolated_env_and_dotenv == ["called"]
