"""Reads the bundled Kaggle perfume dataset into CatalogFragrance records.

Source: "Perfume Dataset" by Ayush (Kaggle user ayushghawana),
https://www.kaggle.com/datasets/ayushghawana/perfume-dataset, licensed
CC BY 4.0 — attribution required, see data/README.md. Real brand/perfume
names; `category`/`target_audience`/`longevity` are the dataset's own fields
and are only used as raw material for the synthetic description this package
generates (description_generator.py) — never presented as Fragrantica or any
other editorial source's text.

No network access, no HTML parsing: this replaced the earlier live
Fragrantica scraper (see specs/perfume-catalog-import.md for why) with a
static, versioned CSV bundled in this package.
"""

import csv
import logging
import re
from collections.abc import Iterator
from pathlib import Path

from .description_generator import generate_description
from .models import CatalogFragrance

logger = logging.getLogger(__name__)

DEFAULT_CSV_PATH = Path(__file__).parent / "data" / "perfumes_dataset.csv"

# Known abbreviations/labels the dataset's `type` column uses, normalized to
# the same canonical concentration strings the Fragrantica-era scraper used
# (kept for consistency with anything already in the `fragrances` table).
_CONCENTRATION_MAP = {
    "edp": "Eau de Parfum",
    "edt": "Eau de Toilette",
    "parfum": "Parfum",
    "extrait de parfum": "Extrait de Parfum",
    "extrait": "Extrait de Parfum",
    "cologne": "Eau de Cologne",
    "oil": "Oil",
    "concentrate": "Concentrate",
    "attar": "Attar",
    "alcohol-free": "Alcohol-Free",
}

_AUDIENCE_MAP = {
    "male": "Male",
    "men": "Male",
    "female": "Female",
    "women": "Female",
    "unisex": "Unisex",
}

_CITATION_ARTIFACT_PATTERN = re.compile(r"\s*:contentReference.*$")

# The dataset mixes properly-cased brands/names ("Jean Paul Gaultier",
# "Parfums de Marly") with fully lowercase ones ("dumont", "paris corner") —
# title-casing everything would wreck the ones already correct (turning
# "Parfums de Marly" into "Parfums De Marly"), so this only touches strings
# that are entirely lowercase to begin with.
_TITLE_CASE_LOWERCASE_WORDS = {"de", "of", "la", "le", "du", "des", "for", "the", "and", "y", "a", "en"}


def _normalize_casing(text: str) -> str:
    if not text.islower():
        return text
    words = text.split(" ")
    return " ".join(
        word.lower()
        if i > 0 and word.lower() in _TITLE_CASE_LOWERCASE_WORDS
        else (word[0].upper() + word[1:].lower() if word else word)
        for i, word in enumerate(words)
    )

_LONGEVITY_MAP = {
    "light": "Light",
    "light-medium": "Light-Medium",
    "light–medium": "Light-Medium",
    "medium": "Medium",
    "medium-strong": "Medium-Strong",
    "medium–strong": "Medium-Strong",
    "strong": "Strong",
    "very strong": "Very Strong",
}


class KaggleCatalogSource:
    """Yields CatalogFragrance records from the bundled perfume dataset CSV.

    See similarityServer/CLAUDE.md for this class's responsibilities
    and specs/perfume-catalog-import.md for the cleaning/normalization rules.
    """

    def __init__(self, csv_path: Path | str = DEFAULT_CSV_PATH) -> None:
        self.csv_path = Path(csv_path)

    def iter_catalog(self) -> Iterator[CatalogFragrance]:
        """Read the CSV and yield one record per valid row.

        A single malformed row must not raise past this method in a way that
        stops the walk — caught and skipped here, logged for the
        orchestrator's summary, same "one bad item doesn't abort the run"
        rule the Fragrantica-era scraper followed.
        """
        with self.csv_path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    record = self._parse_row(row)
                except Exception:
                    logger.exception("Failed to parse dataset row: %r", row)
                    continue
                if record is not None:
                    yield record

    def _parse_row(self, row: dict[str, str]) -> CatalogFragrance | None:
        if self._is_junk_row(row):
            return None

        brand = _normalize_casing(row["brand"].strip()) or None
        name = _normalize_casing(row["perfume"].strip()) or None
        concentration = self._normalize_concentration(row["type"])
        audience = self._normalize_audience(row["target_audience"])
        longevity = self._normalize_longevity(row["longevity"])
        category = row["category"].strip() or None

        description = None
        if name and brand:
            description = generate_description(
                name=name,
                brand=brand,
                category=category,
                audience=audience,
                longevity=longevity,
                concentration=concentration,
            )

        return CatalogFragrance(
            name=name,
            brand=brand,
            concentration=concentration,
            description=description,
            image_url=None,  # this dataset has no photos
            olfactory_family=category,
            target_audience=audience,
            longevity=longevity,
        )

    @staticmethod
    def _is_junk_row(row: dict[str, str]) -> bool:
        # The CSV has its own header duplicated as a data row further down
        # (brand='Brand', perfume='Perfume', type='Type', ...) — a known
        # quirk of this dataset, not a hypothetical one.
        return row.get("type", "").strip() == "Type"

    @staticmethod
    def _normalize_concentration(raw: str) -> str | None:
        key = raw.strip().lower()
        return _CONCENTRATION_MAP.get(key, raw.strip() or None)

    @staticmethod
    def _normalize_audience(raw: str) -> str | None:
        return _AUDIENCE_MAP.get(raw.strip().lower())

    @staticmethod
    def _normalize_longevity(raw: str) -> str | None:
        # A handful of rows carry a leftover LLM-browsing citation marker
        # appended to this field (e.g. "Medium :contentReference[...]") —
        # a real artifact seen in the dataset, stripped before matching.
        cleaned = _CITATION_ARTIFACT_PATTERN.sub("", raw.strip())
        return _LONGEVITY_MAP.get(cleaned.lower())
