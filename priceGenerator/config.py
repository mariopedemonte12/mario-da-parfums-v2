"""Environment-variable configuration loading. No hardcoded values/secrets."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class GeneratorConfig:
    database_url: str
    log_level: str


def load_config() -> GeneratorConfig:
    """Build a GeneratorConfig from environment variables.

    Raises ValueError if DATABASE_URL is missing — this script has no sane
    default connection string to fall back to.
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")

    return GeneratorConfig(
        database_url=database_url,
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
