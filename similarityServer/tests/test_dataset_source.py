"""Unit tests for KaggleCatalogSource against a small fixture CSV -- no network, no DB.

Per specs/perfume-catalog-import.md and CLAUDE.md's "Testing seams" section: the
focus here is that olfactory_family/target_audience/longevity on the returned
CatalogFragrance carry the *same* normalized values that feed the generated
description (they used to be computed and discarded before this feature; now
they must land on the record), and that an unrecognized target_audience/
longevity degrades to null rather than discarding the row.
"""

import csv
import io

import pytest

from similarityServer.dataset_source import KaggleCatalogSource

_HEADER = "brand,perfume,type,category,target_audience,longevity\n"


def _write_csv(tmp_path, rows: list[str]):
    path = tmp_path / "perfumes.csv"
    path.write_text(_HEADER + "".join(rows), encoding="utf-8")
    return path


def _row(brand="Dumont", perfume="Nitro Red", type_="edp", category="Fresh Scent",
         target_audience="Male", longevity="Strong") -> str:
    fields = [brand, perfume, type_, category, target_audience, longevity]
    buf = io.StringIO()
    csv.writer(buf).writerow(fields)
    return buf.getvalue()


def _parse_single(tmp_path, **overrides):
    path = _write_csv(tmp_path, [_row(**overrides)])
    records = list(KaggleCatalogSource(path).iter_catalog())
    assert len(records) == 1
    return records[0]


class TestStructuredColumnsMatchDescriptionInputs:
    """olfactory_family/target_audience/longevity must equal the normalized
    values that were used to build `description` -- not just look plausible."""

    def test_olfactory_family_is_category_trimmed_but_not_case_normalized(self, tmp_path):
        record = _parse_single(tmp_path, category="  Woody Spicy  ")

        assert record.olfactory_family == "Woody Spicy"
        # description lowercases category only for phrasing; the stored column keeps original casing
        assert "woody spicy" in record.description

    def test_target_audience_matches_normalized_value_used_in_description(self, tmp_path):
        record = _parse_single(tmp_path, target_audience="Women")

        assert record.target_audience == "Female"
        assert "pensada para mujer" in record.description

    def test_longevity_matches_normalized_value_used_in_description(self, tmp_path):
        record = _parse_single(tmp_path, longevity="Very Strong")

        assert record.longevity == "Very Strong"
        assert "proyección muy intensa" in record.description

    def test_longevity_citation_artifact_is_stripped_before_normalizing_and_matches_description(self, tmp_path):
        record = _parse_single(tmp_path, longevity="Medium :contentReference[oaicite:1]{index=1}")

        assert record.longevity == "Medium"
        assert "proyección y duración medias" in record.description


class TestUnrecognizedAudienceOrLongevity:
    """Spec: an unrecognized target_audience/longevity lands as null, the row
    is NOT discarded for this reason (only missing name/brand discards)."""

    def test_unrecognized_target_audience_is_null_row_still_produced(self, tmp_path):
        record = _parse_single(tmp_path, target_audience="Gourmand")

        assert record.target_audience is None
        assert record.name == "Nitro Red"
        assert record.brand == "Dumont"
        # description omits the audience clause entirely rather than inventing one
        assert "pensada para" not in record.description
        assert "uso unisex" not in record.description

    def test_unrecognized_longevity_is_null_row_still_produced(self, tmp_path):
        record = _parse_single(tmp_path, longevity="6-8 hours")

        assert record.longevity is None
        assert record.name == "Nitro Red"
        assert record.brand == "Dumont"
        assert "proyección" not in record.description or "duración" not in record.description

    def test_both_unrecognized_row_still_produced_with_both_null(self, tmp_path):
        record = _parse_single(tmp_path, target_audience="Gourmand", longevity="6-8 hours")

        assert record.target_audience is None
        assert record.longevity is None
        assert record.name is not None and record.brand is not None


class TestJunkHeaderRow:
    def test_leaked_duplicate_header_row_is_dropped_entirely(self, tmp_path):
        path = _write_csv(
            tmp_path,
            [
                _row(),
                "Brand,Perfume,Type,Category,Target Audience,Longevity\n",
            ],
        )
        records = list(KaggleCatalogSource(path).iter_catalog())

        assert len(records) == 1
        assert records[0].name == "Nitro Red"


class TestMissingRequiredFields:
    """name/brand are obligatory per CreateFragranceDto -- _parse_row still
    returns a record (discarding is the orchestrator's job), but description
    must be null when either is missing."""

    def test_missing_brand_yields_null_brand_and_null_description(self, tmp_path):
        record = _parse_single(tmp_path, brand="")

        assert record.brand is None
        assert record.name == "Nitro Red"
        assert record.description is None

    def test_missing_name_yields_null_name_and_null_description(self, tmp_path):
        record = _parse_single(tmp_path, perfume="")

        assert record.name is None
        assert record.brand == "Dumont"
        assert record.description is None

    def test_both_missing_yields_null_description(self, tmp_path):
        record = _parse_single(tmp_path, brand="", perfume="")

        assert record.name is None
        assert record.brand is None
        assert record.description is None


class TestCasingNormalization:
    """Title-case only when the original is entirely lowercase, so already
    correctly-cased strings like 'Parfums de Marly' are left untouched."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("dumont", "Dumont"),
            ("paris corner", "Paris Corner"),
            ("jean paul gaultier", "Jean Paul Gaultier"),
        ],
    )
    def test_fully_lowercase_brand_is_title_cased(self, tmp_path, raw, expected):
        record = _parse_single(tmp_path, brand=raw)
        assert record.brand == expected

    def test_already_mixed_case_brand_is_left_untouched(self, tmp_path):
        record = _parse_single(tmp_path, brand="Parfums de Marly")
        assert record.brand == "Parfums de Marly"

    def test_lowercase_connector_words_stay_lowercase_unless_first(self, tmp_path):
        record = _parse_single(tmp_path, brand="parfums de marly")
        assert record.brand == "Parfums de Marly"


class TestConcentrationNormalization:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("edp", "Eau de Parfum"),
            ("EDP", "Eau de Parfum"),
            ("edt", "Eau de Toilette"),
            ("EDT", "Eau de Toilette"),
            ("parfum", "Parfum"),
            ("Parfum", "Parfum"),
            ("extrait", "Extrait de Parfum"),
            ("Extrait de Parfum", "Extrait de Parfum"),
            ("Cologne", "Eau de Cologne"),
            ("Oil", "Oil"),
            ("Concentrate", "Concentrate"),
            ("Attar", "Attar"),
            ("Alcohol-free", "Alcohol-Free"),
        ],
    )
    def test_known_type_maps_to_canonical_concentration(self, tmp_path, raw, expected):
        record = _parse_single(tmp_path, type_=raw)
        assert record.concentration == expected

    def test_unrecognized_type_is_never_discarded_kept_as_original(self, tmp_path):
        record = _parse_single(tmp_path, type_="Mystery Format")
        assert record.concentration == "Mystery Format"
        assert record.name == "Nitro Red"
