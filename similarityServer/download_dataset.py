"""Fetches data/perfumes_dataset.csv from Kaggle.

The CSV is gitignored, not committed (see data/README.md) — run this once
before the importer can do anything, and again by hand whenever the source
dataset gets updated upstream and the local copy needs refreshing.

Requires SIMILARITY_KAGGLE_API_TOKEN (one Kaggle API token: kaggle.com/settings
-> API -> Create New Token) in the repo-root env file (gitignored, never commit
it) or already set as an environment variable. It is handed to the kaggle
library as KAGGLE_API_TOKEN, the variable kaggle 2.x reads. A token file at
~/.kaggle/access_token also works.

Source: "Perfume Dataset" by Ayush (Kaggle user ayushghawana), CC BY 4.0.
https://www.kaggle.com/datasets/ayushghawana/perfume-dataset
"""

import os
from pathlib import Path

from .env_file import load_root_env

DATASET_REF = "ayushghawana/perfume-dataset"
DEST_DIR = Path(__file__).parent / "data"
# Filename Kaggle ships the CSV under, vs. the name dataset_source.py expects
# it at (kept lowercase/stable so DEFAULT_CSV_PATH never needs to change).
_UPSTREAM_FILENAME = "Perfumes_dataset.csv"
_LOCAL_FILENAME = "perfumes_dataset.csv"

TOKEN_VAR = "SIMILARITY_KAGGLE_API_TOKEN"
_LIBRARY_TOKEN_VAR = "KAGGLE_API_TOKEN"
_TOKEN_FILES = (Path("~/.kaggle/access_token"), Path("~/.kaggle/access_token.txt"))


def prepare_kaggle_credentials() -> None:
    """Expose SIMILARITY_KAGGLE_API_TOKEN to the kaggle library as KAGGLE_API_TOKEN.

    An already-set, non-empty KAGGLE_API_TOKEN is left alone. Raises SystemExit
    with an actionable message when no token is available anywhere (kaggle's own
    fallback would print generic help and exit(1) anyway).
    """
    token = os.environ.get(TOKEN_VAR, "").strip()
    if token and not os.environ.get(_LIBRARY_TOKEN_VAR, "").strip():
        os.environ[_LIBRARY_TOKEN_VAR] = token
    if os.environ.get(_LIBRARY_TOKEN_VAR, "").strip():
        return
    if any(f.expanduser().is_file() for f in _TOKEN_FILES):
        return
    raise SystemExit(
        f"{TOKEN_VAR} is not set. Create a token at kaggle.com/settings -> API -> "
        "Create New Token and put it in the repo-root env file."
    )


def main() -> None:
    load_root_env()
    prepare_kaggle_credentials()

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    api.dataset_download_files(DATASET_REF, path=str(DEST_DIR), unzip=True, quiet=False)
    (DEST_DIR / _UPSTREAM_FILENAME).replace(DEST_DIR / _LOCAL_FILENAME)
    print(f"Refreshed dataset from {DATASET_REF} into {DEST_DIR / _LOCAL_FILENAME}")


if __name__ == "__main__":
    main()
