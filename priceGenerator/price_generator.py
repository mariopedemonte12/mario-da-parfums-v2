"""Deterministic price/size/stock/url generation for one (fragrance, vendor) pair.

No I/O, no database — pure functions and a small stateless class. See
specs/price-generator.md, "Generación de precio y ml", "Disponibilidad" and
"Determinismo" for the business rules this implements.
"""

import hashlib
import random
import re
import unicodedata

_PRICE_MIN = 15_000
_PRICE_MAX = 150_000
_OUT_OF_STOCK_RATE = 0.10

# Price (already rounded to a "990" ending) -> size_ml, per the spec's fixed
# tiers. Checked low-to-high; the last entry is the catch-all >= 110_000.
_SIZE_TIERS: list[tuple[int, int]] = [
    (40_000, 30),
    (70_000, 50),
    (110_000, 75),
]
_SIZE_ML_MAX_TIER = 100


def _stable_seed(fragrance_id: str, vendor_id: int) -> int:
    """Hash-derived seed, stable across processes/runs.

    Deliberately hashlib.sha256, never the builtin hash() — str hashing is
    randomized per-process via PYTHONHASHSEED, which would break "running the
    script twice gives the same result".
    """
    digest = hashlib.sha256(f"{fragrance_id}:{vendor_id}".encode("utf-8")).digest()
    return int.from_bytes(digest, byteorder="big")


def _round_to_990(raw_price: int) -> int:
    """Floor `raw_price` to the nearest thousand, then shift to a "990" ending.

    E.g. 34_567 -> 33_990, 15_000 -> 14_990. This is "vidriera" rounding
    (round down to the nearest display price, real retailers never round
    up past a psychological threshold) — it can land up to $10 below
    `_PRICE_MIN` at the very bottom of the range (14_990 instead of 15_000),
    which is an accepted, deliberate consequence of requiring both a numeric
    floor AND a "990" ending: no integer satisfies both endpoints exactly.
    """
    return (raw_price // 1_000) * 1_000 - 10


def _size_ml_for_price(price: int) -> int:
    for threshold, size_ml in _SIZE_TIERS:
        if price < threshold:
            return size_ml
    return _SIZE_ML_MAX_TIER


def slugify(text: str) -> str:
    """ASCII, lowercase, hyphen-separated slug — used to build listing URLs."""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return slug


def build_listing_url(website_url: str, fragrance_name: str, size_ml: int) -> str:
    """Deterministic fake product URL — never a real product, just fabricated data."""
    return f"{website_url}/producto/{slugify(fragrance_name)}-{size_ml}ml"


class PriceGenerator:
    """Generates a deterministic (price, size_ml, in_stock) triple per pair."""

    def generate(self, fragrance_id: str, vendor_id: int) -> tuple[int, int, bool]:
        rng = random.Random(_stable_seed(fragrance_id, vendor_id))

        # Draw order matters for reproducibility: price first, then the
        # availability roll (spec, "Determinismo").
        raw_price = rng.randint(_PRICE_MIN, _PRICE_MAX)
        in_stock = rng.random() >= _OUT_OF_STOCK_RATE

        price = _round_to_990(raw_price)
        size_ml = _size_ml_for_price(price)
        return price, size_ml, in_stock
