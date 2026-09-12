"""The fixed list of 5 fake vendors this generator invents.

See specs/price-generator.md, "Vendors falsos" — deliberately fictitious
names/domains (`.example.com`), never resembling real Chilean retailers.
Editing this list is a spec change, not a config value: keep it here, not in
an env var or a DB seed.
"""

from .models import FakeVendor

FAKE_VENDORS: list[FakeVendor] = [
    FakeVendor(
        name="Aromas del Pacífico",
        website_url="https://www.aromasdelpacifico.example.com",
    ),
    FakeVendor(
        name="Botica Andina",
        website_url="https://www.boticaandina.example.com",
    ),
    FakeVendor(
        name="EsenciaClub",
        website_url="https://www.esenciaclub.example.com",
    ),
    FakeVendor(
        name="Perfumería Austral",
        website_url="https://www.perfumeriaaustral.example.com",
    ),
    FakeVendor(
        name="Fragancia Express",
        website_url="https://www.fraganciaexpress.example.com",
    ),
]
