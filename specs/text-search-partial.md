# text-search-partial — búsqueda textual parcial de perfumes y marcas

## Propósito

Hoy `GET /fragrances?name=` solo busca por contains sobre el nombre del
perfume; `brand` es match exacto. Buscar `jean` no encuentra
`Jean Paul Gaultier` (la marca no participa) y una consulta multi-palabra
como `dior sauvage` no matchea si las palabras están repartidas entre marca y
nombre. Esta feature agrega una búsqueda textual libre, parcial y tolerante
al orden de las palabras. Es **textual** (ILIKE/trigramas), independiente de
la búsqueda semántica (`/search`, HNSW).

## Contrato

- Nuevo query param opcional `search` en `GET /fragrances` (string).
- Los filtros existentes (`name` contains, `brand` exacto case-insensitive,
  `concentration`, `olfactoryFamily`, `targetAudience`, `longevity`) siguen
  igual y se combinan con `search` por AND.
- Paginación por cursor (`cursor`, `limit`, `nextCursor`) y orden por `id`
  ascendente no cambian; `search` solo restringe el conjunto de filas.

## Reglas

1. El valor se recorta (trim) y se divide en tokens por espacios en blanco
   (uno o más). Los tokens vacíos se ignoran.
2. Un perfume matchea si **cada** token aparece (substring, insensible a
   mayúsculas/minúsculas) en su `name` **o** en su `brand`. Un token puede
   matchear en un campo y otro token en el otro.
3. El orden de los tokens es irrelevante: `dior sauvage` == `sauvage dior`.
4. Un token repetido no cambia el resultado.
5. Los comodines LIKE `%`, `_` y el carácter `\` se tratan como literales,
   nunca como comodines.
6. Un `search` vacío o solo espacios equivale a no enviarlo (sin filtro).
7. Máximo 5 tokens y 100 caracteres por valor de `search`; excederlos es un
   error de validación 400 (protección de costo de consulta).

## Ejemplos

- `jean` y `gaultier` → Jean Paul Gaultier (por marca).
- `bleu` → Bleu de Chanel (por nombre).
- `Bleu de Chanel` (nombre completo) → Bleu de Chanel.
- `BLEU`, `bleu`, `BlEu` → mismos resultados.
- `dior sauvage` y `sauvage dior` → Sauvage de Dior.
- `chanel bleu` → Bleu de Chanel (token de marca + token de nombre).
- `50%` solo matchea textos que contengan literalmente `50%`.
- `zzzz` → `data: []`, `nextCursor: null` (no es error).

## Edge cases

- Acentos: no se normalizan (fuera de alcance); `chanél` no matchea `Chanel`.
- Tokens de 1 carácter son válidos (pueden ser lentos; el límite de tokens
  acota el costo).
- `search` combinado con `cursor`: la página siguiente respeta ambos.
- `search` combinado con `brand`/`name`: se exigen todas las condiciones.

## Fuera de alcance

- Ranking por relevancia (el orden sigue siendo por `id`).
- Tolerancia a typos / fuzzy, normalización de acentos.
- Búsqueda semántica (`/search`, similarityServer, perfumeCatalogImporter).
- Cambios de frontend (adoptar `search` en el buscador es trabajo aparte).
- Búsqueda en otros módulos (vendors, users).
