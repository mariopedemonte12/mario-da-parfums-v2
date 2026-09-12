"""CLI entrypoint: build a scraper + repository from config, run the orchestrator once."""

from .config import load_config
from .orchestrator import CatalogSyncOrchestrator
from .repository import FragranceRepository
from .scraper import FragranticaScraper


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
