"""HTTP fetching + HTML parsing for the Fragrantica catalog. No DB knowledge here."""

from collections.abc import Iterator

from .models import ScrapedFragrance


class FragranticaScraper:
    """Yields ScrapedFragrance records from the Fragrantica catalog.

    See fragranticaScraper/CLAUDE.md for this class's responsibilities and
    specs/fragrantica-scraper.md for the business rules it must honor
    (imageUrl shape validation, per-page failure isolation, request pacing).
    """

    def __init__(self, base_url: str, request_delay_seconds: float = 1.0) -> None:
        self.base_url = base_url
        self.request_delay_seconds = request_delay_seconds

    def iter_catalog(self) -> Iterator[ScrapedFragrance]:
        """Walk the catalog and yield one record per perfume found.

        A single page failing to fetch/parse must not raise past this method
        in a way that stops the walk — catch and skip, surface it so the
        orchestrator can log it.
        """
        raise NotImplementedError
