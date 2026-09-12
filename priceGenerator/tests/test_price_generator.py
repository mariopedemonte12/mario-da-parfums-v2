"""Unit tests for price_generator.py -- pure, deterministic generation.

See specs/price-generator.md ("Generación de precio y ml", "Disponibilidad",
"Determinismo") and priceGenerator/CLAUDE.md (the "990" rounding decision and
its documented 14_990 floor) for the business rules asserted here.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

from priceGenerator.price_generator import (
    _PRICE_MAX,
    _PRICE_MIN,
    PriceGenerator,
    _round_to_990,
    _size_ml_for_price,
    build_listing_url,
    slugify,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]


# --- Determinism -------------------------------------------------------------


def test_generate_is_deterministic_within_a_process():
    first = PriceGenerator().generate("frag-1", 1)
    second = PriceGenerator().generate("frag-1", 1)  # separate instance, no shared state
    assert first == second


def test_generate_differs_for_different_inputs():
    gen = PriceGenerator()
    assert gen.generate("frag-1", 1) != gen.generate("frag-2", 1)
    assert gen.generate("frag-1", 1) != gen.generate("frag-1", 2)


def _generate_in_subprocess(fragrance_id: str, vendor_id: int, hashseed: str) -> str:
    script = (
        "from priceGenerator.price_generator import PriceGenerator\n"
        f"print(PriceGenerator().generate({fragrance_id!r}, {vendor_id!r}))"
    )
    env = {**os.environ, "PYTHONHASHSEED": hashseed}
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        cwd=_REPO_ROOT,
        env=env,
        check=True,
    )
    return result.stdout.strip()


def test_generate_is_deterministic_across_separate_processes_with_different_hashseed():
    """The spec's central requirement: two Python *processes* must agree, not
    just two calls in one process. This is exactly what hashlib.sha256 (vs
    the PYTHONHASHSEED-randomized builtin hash()) guarantees -- a same-process
    test alone would not catch a regression back to hash().
    """
    first = _generate_in_subprocess("cross-process-fragrance", 42, hashseed="1")
    second = _generate_in_subprocess("cross-process-fragrance", 42, hashseed="999999")

    assert first != ""
    assert first == second


# --- Price range constants (spec: "CLP $15.000 - $150.000") -----------------


def test_price_range_constants_match_the_spec_exactly():
    assert _PRICE_MIN == 15_000
    assert _PRICE_MAX == 150_000


# --- Price rounding ("990" ending) -------------------------------------------


@pytest.mark.parametrize(
    "raw_price, expected",
    [
        (15_000, 14_990),  # documented floor-of-range side effect, not a bug (priceGenerator/CLAUDE.md)
        (15_999, 14_990),  # same thousand-bucket as 15_000
        (16_000, 15_990),  # next bucket up
        (150_000, 149_990),  # top of the stated $15.000-$150.000 range
    ],
)
def test_round_to_990(raw_price, expected):
    assert _round_to_990(raw_price) == expected


def test_generated_price_always_ends_in_990_and_stays_in_documented_range():
    gen = PriceGenerator()
    prices = [gen.generate(str(uuid.uuid4()), i)[0] for i in range(2000)]

    assert all(price % 1_000 == 990 for price in prices)
    assert min(prices) >= 14_990  # documented floor, priceGenerator/CLAUDE.md
    assert max(prices) <= 149_990  # 150_000 raw always rounds down to 149_990


# --- Price -> size_ml tiers (two-point boundary value analysis) -------------


@pytest.mark.parametrize(
    "price, expected_size_ml",
    [
        (39_999, 30),  # just below the < 40.000 cut
        (40_000, 50),  # exactly at the cut -> next tier
        (69_999, 50),  # just below the 70.000 cut
        (70_000, 75),  # exactly at the cut -> next tier
        (109_999, 75),  # just below the 110.000 cut
        (110_000, 100),  # exactly at the cut -> top tier
    ],
)
def test_size_ml_tier_boundaries(price, expected_size_ml):
    assert _size_ml_for_price(price) == expected_size_ml


@pytest.mark.parametrize(
    "vendor_id, expected_price, expected_size_ml",
    [
        (173, 39_990, 30),  # just below the 40_000 cut
        (40, 40_990, 50),  # just above the 40_000 cut
        (100, 69_990, 50),  # just below the 70_000 cut
        (305, 70_990, 75),  # just above the 70_000 cut
        (366, 109_990, 75),  # just below the 110_000 cut
        (380, 110_990, 100),  # just above the 110_000 cut
    ],
)
def test_size_ml_tier_boundaries_through_full_pipeline(vendor_id, expected_price, expected_size_ml):
    """(fragrance_id="boundary-search-fragrance", vendor_id) pairs found via a
    small hill-climbing/enumeration search over vendor_id, targeting each
    exact "990"-ending price on both sides of the three spec cuts end-to-end
    through generate() -- not just the isolated _size_ml_for_price helper
    above. Hardcoded per the testing skill's fuzzing recipe: hard-code the
    discovered value once found, don't ship the search itself.
    """
    price, size_ml, _ = PriceGenerator().generate("boundary-search-fragrance", vendor_id)
    assert price == expected_price
    assert size_ml == expected_size_ml


# --- Availability (~10%, aggregate rate) -------------------------------------


def test_out_of_stock_rate_is_approximately_ten_percent_over_large_sample():
    gen = PriceGenerator()
    n = 20_000
    out_of_stock = sum(1 for i in range(n) if not gen.generate(str(uuid.uuid4()), i)[2])
    rate = out_of_stock / n

    # 10% is an aggregate design target (spec), not a per-combination exact
    # value -- a wide-but-meaningful band that would still catch e.g. an
    # inverted comparison or an accidental ~50% rate, without being flaky.
    assert 0.08 <= rate <= 0.12


def test_out_of_stock_membership_is_stable_across_reruns():
    ids = [(str(uuid.uuid4()), i) for i in range(500)]
    first_run = {(f, v): PriceGenerator().generate(f, v)[2] for f, v in ids}
    second_run = {(f, v): PriceGenerator().generate(f, v)[2] for f, v in ids}
    assert first_run == second_run


# --- slugify / build_listing_url --------------------------------------------


@pytest.mark.parametrize(
    "raw_name, expected_slug",
    [
        ("Chanel N°5", "chanel-n5"),
        ("Chloé", "chloe"),
        ("  Eau  De   Parfum!!  ", "eau-de-parfum"),
        ("Acqua di Giò", "acqua-di-gio"),
        ("L'Homme", "l-homme"),
        ("CAFÉ_ÉLÉGANT", "cafe-elegant"),
    ],
)
def test_slugify_handles_accents_case_and_punctuation(raw_name, expected_slug):
    assert slugify(raw_name) == expected_slug


def test_build_listing_url_matches_documented_format():
    url = build_listing_url("https://www.example.com", "Chanel N°5", 50)
    assert url == "https://www.example.com/producto/chanel-n5-50ml"
