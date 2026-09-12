"""Environment-variable configuration loading. No hardcoded values/secrets."""

from dataclasses import dataclass


@dataclass
class ImporterConfig:
    database_url: str
    dataset_csv_path: str
    log_level: str


def load_config() -> ImporterConfig:
    """Build an ImporterConfig from environment variables."""
    raise NotImplementedError
