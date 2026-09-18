"""Fetches data/perfumes_dataset.csv from Kaggle.

The CSV is gitignored, not committed (see data/README.md) — run this once
before the importer can do anything, and again by hand whenever the source
dataset gets updated upstream and the local copy needs refreshing.

Requires KAGGLE_USERNAME and KAGGLE_KEY in a local `.env` file (gitignored,
never commit it — create an API token at kaggle.com/settings) or already set
as environment variables.

Source: "Perfume Dataset" by Ayush (Kaggle user ayushghawana), CC BY 4.0.
https://www.kaggle.com/datasets/ayushghawana/perfume-dataset
"""

from pathlib import Path

from dotenv import load_dotenv

DATASET_REF = "ayushghawana/perfume-dataset"
DEST_DIR = Path(__file__).parent / "data"
# Filename Kaggle ships the CSV under, vs. the name dataset_source.py expects
# it at (kept lowercase/stable so DEFAULT_CSV_PATH never needs to change).
_UPSTREAM_FILENAME = "Perfumes_dataset.csv"
_LOCAL_FILENAME = "perfumes_dataset.csv"


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    api.dataset_download_files(DATASET_REF, path=str(DEST_DIR), unzip=True, quiet=False)
    (DEST_DIR / _UPSTREAM_FILENAME).replace(DEST_DIR / _LOCAL_FILENAME)
    print(f"Refreshed dataset from {DATASET_REF} into {DEST_DIR / _LOCAL_FILENAME}")


if __name__ == "__main__":
    main()
