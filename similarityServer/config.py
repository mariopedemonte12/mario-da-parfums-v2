"""Environment-variable configuration loading. No hardcoded values/secrets."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .dataset_source import DEFAULT_CSV_PATH


@dataclass
class ImporterConfig:
    database_url: str
    dataset_csv_path: str
    log_level: str


def load_config() -> ImporterConfig:
    """Build an ImporterConfig from environment variables."""
    load_dotenv(Path(__file__).parent / ".env")

    return ImporterConfig(
        database_url=os.environ["DATABASE_URL"],
        dataset_csv_path=os.environ.get("SIMILARITY_DATASET_CSV_PATH", str(DEFAULT_CSV_PATH)),
        log_level=os.environ.get("SIMILARITY_LOG_LEVEL", "info"),
    )
