"""CLI entrypoint: build a dataset source + repository from config, run the orchestrator once."""

from .config import load_config
from .dataset_source import KaggleCatalogSource
from .orchestrator import CatalogSyncOrchestrator
from .repository import FragranceRepository


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
