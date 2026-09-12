# perfumes_dataset.csv — source and license

**Not committed** — gitignored on purpose, same as any other real-world
dataset/model-weights file. Run `python -m perfumeCatalogImporter.download_dataset`
(needs `KAGGLE_USERNAME`/`KAGGLE_KEY` in a local `.env`, see that script's
docstring) to fetch it before running the importer.

**Source**: ["Perfume Dataset"](https://www.kaggle.com/datasets/ayushghawana/perfume-dataset)
by Ayush (Kaggle user `ayushghawana`).

**License**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
attribution required. This file is redistributed here under that license;
this note is the attribution.

**As downloaded, unmodified** (`download_dataset.py` recreates it byte-for-byte
from the same Kaggle ref). Cleaning/normalization happens at import time in
`dataset_source.py`, not in this file — known issues in the raw data (a
duplicated header row further down, a few `longevity` values with leftover
LLM-browsing citation markers like `:contentReference[oaicite:0]{index=0}`)
are handled there, see `specs/perfume-catalog-import.md`.
