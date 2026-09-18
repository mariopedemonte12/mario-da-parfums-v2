# Búsqueda textual


> Spec: [`specs/text-search-partial.md`](../../specs/text-search-partial.md). Implementado en `master`.

## Problema

El usuario conoce parte del nombre o de la marca ("jean", "chanel bleu") y espera encontrar el perfume sin escribirlo completo ni en el orden exacto.

## Solución

Un único parámetro de texto libre, `search`, en `GET /fragrances`. Es **el único mecanismo textual**: los filtros `name` y `brand` fueron eliminados. Si un cliente antiguo aún los envía, el `ValidationPipe` global (`whitelist: true`, sin `forbidNonWhitelisted`) los **ignora en silencio**: no hay error 400 y la consulta se responde sin ese filtro. Se combina con los filtros categóricos (concentración, familia olfativa, público, longevidad) y con la paginación por cursor. Es independiente de la [búsqueda semántica](busqueda-semantica.md).

## Funcionamiento

Reglas ([`specs/text-search-partial.md`](../../specs/text-search-partial.md)):

1. El valor se recorta y se divide en tokens por espacios; los tokens vacíos se ignoran.
2. Un perfume coincide si **cada** token aparece (subcadena, insensible a mayúsculas) en `name` **o** en `brand` (AND entre tokens, OR entre campos). Un token puede coincidir en un campo y otro en el otro.
3. El orden de los tokens no importa; un token repetido no cambia el resultado.
4. `%`, `_` y `\` se tratan como literales ([`sql-like.util.ts`](../../backend/src/common/utils/sql-like.util.ts)).
5. `search` vacío = sin filtro.
6. Máximo **5 tokens y 100 caracteres**; excederlo es error de validación 400.

Ejemplos: `jean` → Jean Paul Gaultier (por marca); `chanel bleu` = `bleu chanel` → Bleu de Chanel; `zzzz` → `data: []`, `nextCursor: null`.

Otros aspectos:
- Paginación por cursor: orden por `id` ascendente, `limit` por defecto 20 (máx. 100), `nextCursor` = último `id` si la página vino llena ([`fragrances.service.ts`](../../backend/src/fragrances/fragrances.service.ts)).
- Rendimiento: índices GIN `pg_trgm` sobre `name` ([`0004_groovy_bug.sql`](../../backend/drizzle/0004_groovy_bug.sql)) y sobre `brand` ([`0005_brand_trgm_idx.sql`](../../backend/drizzle/0005_brand_trgm_idx.sql)). La medición documentada (Seq Scan de ~84–119 ms a ~1–5 ms en 300 mil filas sintéticas) corresponde a `name` ([`backend/src/database/NOTES.md`](../../backend/src/database/NOTES.md)).

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
- Buscar por marca *y* nombre con filtros separados ya no es posible; se hace con tokens en `search` (`chanel bleu`).

## Consumidores

- **Frontend, `/fragrances`**: envía `search`; el filtro por marca de la barra lateral se eliminó porque `search` ya cubre la marca.
- **Frontend, resultado semántico del home**: [`findFragranceByExactName`](../../frontend/src/features/fragrances/api/fragrances.api.ts) busca con `search=<nombre>` (recortado a 5 tokens / 100 caracteres para respetar el límite), pide `limit=50` y filtra por igualdad exacta de nombre en el cliente. Si el nombre exacto cae fuera de esos 50 resultados no se resuelve (limitación de ese enfoque).
- **MCP (`search_fragrances`)**: la tool del backend expone `search` (más `concentration`, `cursor`, `limit`) ([`register-catalog-tools.ts`](../../backend/src/mcp/tools/register-catalog-tools.ts)).
