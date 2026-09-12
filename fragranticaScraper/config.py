"""Environment-variable configuration loading. No hardcoded values/secrets."""

from dataclasses import dataclass


@dataclass
class ScraperConfig:
    database_url: str
    fragrantica_base_url: str
    request_delay_seconds: float
    log_level: str


def load_config() -> ScraperConfig:
    """Build a ScraperConfig from environment variables."""
    raise NotImplementedError
