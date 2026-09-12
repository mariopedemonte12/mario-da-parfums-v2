# `favorites` — notes

- **No single-item mutation routes, only `POST/DELETE /favorites/batch`** — a
  single mark/unmark is a batch of one, same convention as `vendors`. There is
  no `PATCH` batch: a favorite has no mutable field, it only exists or
  doesn't, so "update" doesn't apply here.
- **Batch bodies are a flat `fragranceIds: string[]`**, not
  `{ items: CreateFavoriteDto[] }` — `CreateFavoriteDto` would only ever carry
  one field (`fragranceId`), so wrapping it per item is pure noise. Same
  reasoning `fragrances`' `DeleteFragranceBatchDto.ids` already applies.
- **`ResponseFavoriteDto` embeds `ResponseFragranceDto`** (imported from the
  `fragrances` module's `dto/`) instead of redeclaring the fragrance fields —
  it's the module's public response contract, not an internal, so reusing it
  avoids drift between the two response shapes.
- **Fragrance existence is checked via `FragrancesService.findOne`**, not a
  direct query against the `fragrances` table — keeps module boundaries
  (favorites doesn't own fragrance data) and gets a consistent 404 message.
- **Scope**: only "list a user's own favorites" and "favorite count for a
  fragrance" are implemented (agreed minimum with the user). Joining favorites
  with price/listing data, and a ranked "most popular fragrances" endpoint,
  are deliberately out — see `specs/favorite-module.md`.
