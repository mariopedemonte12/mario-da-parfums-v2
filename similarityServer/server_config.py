"""Environment-variable configuration for the FastAPI similarity-search server.

Deliberately separate from config.ImporterConfig (the CLI import job's
config): this process never needs the dataset CSV path, and the import job
never needs the embeddings/model/HTTP settings below. Loaded from a local
the optional repo-root env file (see env_file.py) so running the server
locally doesn't require exporting env vars by hand; in Docker or a real
deployment the platform sets these directly instead.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from .env_file import load_root_env

DEFAULT_EMBEDDINGS_PATH = Path(__file__).parent / "embeddings.npz"
DEFAULT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_MCP_MOUNT_PATH = "/mcp"


@dataclass
class ServerConfig:
    database_url: str
    embeddings_path: Path
    model_name: str
    host: str
    port: int
    log_level: str


def load_server_config() -> ServerConfig:
    load_root_env()

    return ServerConfig(
        database_url=os.environ["DATABASE_URL"],
        embeddings_path=Path(
            os.environ.get("SIMILARITY_EMBEDDINGS_PATH", DEFAULT_EMBEDDINGS_PATH)
        ),
        model_name=os.environ.get("SIMILARITY_MODEL_NAME", DEFAULT_MODEL_NAME),
        host=os.environ.get("SIMILARITY_HOST", "0.0.0.0"),
        port=int(os.environ.get("SIMILARITY_PORT", "8001")),
        log_level=os.environ.get("SIMILARITY_LOG_LEVEL", "info"),
    )


def load_mcp_mount_path() -> str:
    """Where the MCP sub-app is mounted on the FastAPI app.

    Read on its own, separate from load_server_config(): the mount happens at
    app.py's module scope (before the app starts, so the route exists from the
    first request), and load_server_config() requires DATABASE_URL -- forcing
    that at import time would break app.py's existing test seam (lifespan
    skipped/overridden, DB never touched).
    """
    load_root_env()
    return os.environ.get("SIMILARITY_MCP_MOUNT_PATH", DEFAULT_MCP_MOUNT_PATH)
