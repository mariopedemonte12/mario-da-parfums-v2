"""Synthetic description generation for imported perfumes.

Every description here is fabricated from structured metadata (brand,
category/family, target audience, longevity, concentration) — never copied
editorial text from Fragrantica, Kaggle, or anywhere else. See
specs/perfume-catalog-import.md for why: this package deliberately stopped
scraping live sites, so it has no real description to reuse in the first
place, only the metadata columns the Kaggle dataset ships with.
"""

import random

_AUDIENCE_PHRASES = {
    "Male": "pensada para hombre",
    "Female": "pensada para mujer",
    "Unisex": "de uso unisex",
}

_LONGEVITY_PHRASES = {
    "Light": "de proyección suave y duración discreta",
    "Light-Medium": "de proyección moderada y duración media",
    "Medium": "de proyección y duración medias",
    "Medium-Strong": "de buena proyección y larga duración",
    "Strong": "de proyección intensa y larga duración",
    "Very Strong": "de proyección muy intensa y duración prolongada",
}

_TEMPLATES = (
    "{name}, de {brand}, es un {concentration} de la familia olfativa {category}"
    "{audience_clause}{longevity_clause}.",
    "Una fragancia {category} firmada por {brand}: {name} es un {concentration}"
    "{longevity_clause}{audience_clause}.",
    "{name} ({brand}) combina acordes {category} en formato {concentration}"
    "{audience_clause}{longevity_clause}.",
    "De la casa {brand}, {name} es un {concentration} de carácter {category}"
    "{longevity_clause}{audience_clause}.",
)


def generate_description(
    name: str,
    brand: str,
    category: str | None,
    audience: str | None,
    longevity: str | None,
    concentration: str | None,
) -> str:
    """Build a plausible-sounding but fully invented Spanish blurb.

    Deterministic per (name, brand): a fixed seed picks the template, so
    re-running the import doesn't churn descriptions that didn't change.
    """
    rng = random.Random(f"{brand}|{name}")
    template = rng.choice(_TEMPLATES)

    audience_clause = f", {_AUDIENCE_PHRASES[audience]}" if audience in _AUDIENCE_PHRASES else ""
    longevity_clause = (
        f", {_LONGEVITY_PHRASES[longevity]}" if longevity in _LONGEVITY_PHRASES else ""
    )

    return template.format(
        name=name,
        brand=brand,
        category=(category or "floral").lower(),
        concentration=(concentration or "perfume"),
        audience_clause=audience_clause,
        longevity_clause=longevity_clause,
    )
