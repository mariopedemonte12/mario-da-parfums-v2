"""Unit tests for the fixed fake-vendor catalog (vendor_catalog.py).

Spec: specs/price-generator.md, "Vendors falsos" -- exactly 5 fixed vendors,
never resembling a real Chilean retailer, all under .example.com so they can
never resolve to a real site.
"""

from priceGenerator.vendor_catalog import FAKE_VENDORS

_EXPECTED = [
    ("Aromas del Pacífico", "https://www.aromasdelpacifico.example.com"),
    ("Botica Andina", "https://www.boticaandina.example.com"),
    ("EsenciaClub", "https://www.esenciaclub.example.com"),
    ("Perfumería Austral", "https://www.perfumeriaaustral.example.com"),
    ("Fragancia Express", "https://www.fraganciaexpress.example.com"),
]


def test_fake_vendors_match_the_spec_table_exactly():
    actual = [(v.name, v.website_url) for v in FAKE_VENDORS]
    assert actual == _EXPECTED


def test_fake_vendors_all_use_example_domain_never_a_real_looking_one():
    for vendor in FAKE_VENDORS:
        assert ".example.com" in vendor.website_url


def test_fake_vendor_names_are_unique():
    names = [v.name for v in FAKE_VENDORS]
    assert len(names) == len(set(names))
