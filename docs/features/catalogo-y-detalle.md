# Catálogo y detalle de perfumes

> **Estado: Borrador — pendiente de confirmar contra infra final.**

## Problema

Explorar los ~1.000 perfumes del catálogo, filtrarlos y ver el detalle de cada uno.

## Solución

Página `/fragrances` con buscador y filtros (marca, concentración, público, longevidad), lista con "cargar más", y página `/fragrances/[id]` con ficha del perfume y la tabla de precios ([comparador](comparador-precios.md)).

## Funcionamiento

- API pública `GET /fragrances` y `GET /fragrances/:id` ([`fragrances.controller.ts`](../../backend/src/fragrances/fragrances.controller.ts)); paginación por cursor sobre `id` uuid; búsqueda en [busqueda-textual.md](busqueda-textual.md).
- Campos: `name`, `brand`, `concentration`, `description` (sintética), `imageUrl` (nulo con el dataset actual), `olfactoryFamily`, `targetAudience`, `longevity` ([`fragrance.schema.ts`](../../backend/src/database/schema/fragrance.schema.ts)). Unicidad por `(name, brand)`.
- Frontend: [`frontend/src/features/fragrances/`](../../frontend/src/features/fragrances); las imágenes ausentes se muestran con un placeholder ([`BottlePlaceholder.tsx`](../../frontend/src/components/ui/BottlePlaceholder.tsx)).

## Decisiones

Cursor en vez de offset; campos olfativos como `varchar` abierto (no enum) porque vienen de un dataset con vocabulario abierto ([`fragrance.schema.ts`](../../backend/src/database/schema/fragrance.schema.ts)).

## Limitaciones

- Descripciones inventadas por plantilla; sin imágenes ni notas olfativas reales.
- El listado no muestra precios.
