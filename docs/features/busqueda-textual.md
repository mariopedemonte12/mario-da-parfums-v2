# Búsqueda textual

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> `search` está implementado en la rama `feature/text-search-partial` (commit `3603d06`, leído con `git show`; spec `specs/text-search-partial.md` de esa rama, que **aún no está en esta rama ni en `master`**, por lo que no enlazada aquí por eso). > TODO(verificar): merge a master y eliminación de los filtros exactos `name`/`brand` (decisión tomada, la implementa otro agente).

## Problema

El usuario conoce parte del nombre o de la marca ("jean", "chanel bleu") y espera encontrar el perfume sin escribirlo completo ni en el orden exacto.

## Solución

Un único parámetro de texto libre, `search`, en `GET /fragrances`. Es **el único mecanismo textual**: los filtros exactos `name` y `brand` se eliminan. Se combina con los filtros categóricos (concentración, familia olfativa, público, longevidad) y con la paginación por cursor. Es independiente de la [búsqueda semántica](busqueda-semantica.md).

## Funcionamiento

Reglas (`specs/text-search-partial.md` (en la rama `feature/text-search-partial`)):

1. El valor se recorta y se divide en tokens por espacios; los tokens vacíos se ignoran.
2. Un perfume coincide si **cada** token aparece (subcadena, insensible a mayúsculas) en `name` **o** en `brand` (AND entre tokens, OR entre campos). Un token puede coincidir en un campo y otro en el otro.
3. El orden de los tokens no importa; un token repetido no cambia el resultado.
4. `%`, `_` y `\` se tratan como literales ([`sql-like.util.ts`](../../backend/src/common/utils/sql-like.util.ts)).
5. `search` vacío = sin filtro.
6. Máximo 5 tokens y 100 caracteres; excederlo es error de validación 400.

Ejemplos: `jean` → Jean Paul Gaultier (por marca); `chanel bleu` = `bleu chanel` → Bleu de Chanel; `zzzz` → `data: []`, `nextCursor: null`.

Otros aspectos:
- Paginación por cursor: orden por `id` ascendente, `limit` por defecto 20 (máx. 100), `nextCursor` = último `id` si la página vino llena ([`fragrances.service.ts`](../../backend/src/fragrances/fragrances.service.ts)).
- Rendimiento: índices GIN `pg_trgm` sobre `name` ([`0004_groovy_bug.sql`](../../backend/drizzle/0004_groovy_bug.sql)) y sobre `brand` (migración `0005_brand_trgm_idx.sql`, en esa rama). La medición documentada (Seq Scan de ~84–119 ms a ~1–5 ms en 300 mil filas sintéticas) corresponde a `name` ([`backend/src/database/NOTES.md`](../../backend/src/database/NOTES.md)).

## Decisiones

- Trigramas (`pg_trgm` + `ILIKE`) porque un patrón `%término%` no puede usar un B-tree ([`specs/query-performance.md`](../../specs/query-performance.md)).
- Tokens con AND entre ellos y OR entre `name`/`brand`: tolera orden de palabras y reparto marca/nombre sin motor de búsqueda externo.
- Límites de 5 tokens / 100 caracteres para acotar el costo de consulta.
- Paginación por cursor en vez de `offset` ([`specs/fragrance-catalog-cursor-pagination.md`](../../specs/fragrance-catalog-cursor-pagination.md)).
- Textual y semántica separadas ([`../design-decisions.md`](../design-decisions.md#1-búsqueda-textual-vs-semántica)).

## Limitaciones

- Sin ranking por relevancia (orden por `id`), sin tolerancia a erratas, sin normalización de acentos (`chanél` no encuentra `Chanel`).
- Tokens de 1 carácter son válidos y pueden ser lentos (acotado por el límite de tokens).
- No busca en descripciones ni notas: para eso, la búsqueda semántica.
- > TODO(verificar): el frontend (`/fragrances`) enviaba `name` y el resolvedor de la búsqueda semántica usa `GET /fragrances?name=` ([`fragrances.api.ts`](../../frontend/src/features/fragrances/api/fragrances.api.ts)); al eliminar `name` deben migrar a `search`, y la resolución exacta por nombre necesitará otra vía.
- > TODO(verificar): la tool MCP `search_fragrances` (backend) debe pasar a exponer `search`.
