"""CLI entrypoint: build a dataset source + repository from config, run the orchestrator once."""

import logging

import psycopg2

from .config import load_config
from .dataset_source import KaggleCatalogSource
from .orchestrator import CatalogSyncOrchestrator
from .repository import FragranceRepository


def main() -> None:
    config = load_config()
    logging.basicConfig(level=config.log_level.upper())

    connection = psycopg2.connect(config.database_url)
    try:
        source = KaggleCatalogSource(config.dataset_csv_path)
        repository = FragranceRepository(connection)
        CatalogSyncOrchestrator(source, repository).run()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
