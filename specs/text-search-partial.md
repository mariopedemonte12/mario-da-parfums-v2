# text-search-partial — búsqueda textual parcial de perfumes y marcas

## Propósito

Antes `GET /fragrances?name=` solo buscaba por contains sobre el nombre del
perfume y `brand` era match exacto. Buscar `jean` no encuentra
`Jean Paul Gaultier` (la marca no participa) y una consulta multi-palabra
como `dior sauvage` no matchea si las palabras están repartidas entre marca y
nombre. Esta feature agrega una búsqueda textual libre, parcial y tolerante
al orden de las palabras. Es **textual** (ILIKE/trigramas), independiente de
la búsqueda semántica (`/search`, HNSW).

## Contrato

- Nuevo query param opcional `search` en `GET /fragrances` (string).
- **`search` es el ÚNICO mecanismo textual** (decisión de alcance
  posterior): los filtros `name` (contains) y `brand` (exacto) de
  `GET /fragrances` se ELIMINAN. Los filtros exactos `concentration`,
  `olfactoryFamily`, `targetAudience`, `longevity` siguen igual y se combinan
  con `search` por AND.
- Si un cliente aún envía `name` o `brand`: el `ValidationPipe` global usa
  `whitelist: true` sin `forbidNonWhitelisted`, así que los parámetros
  desconocidos se **ignoran silenciosamente** (no hay 400) y la consulta se
  responde sin ese filtro. Se decide conservar ese comportamiento global
  (activar `forbidNonWhitelisted` afectaría a todos los endpoints).
- Herramienta MCP `search_fragrances`: expone `search` (+ `concentration`,
  `cursor`, `limit`) en lugar de `name`/`brand`.
- Frontend: el buscador de `/fragrances` envía `search`; el input de filtro
  por marca de la barra lateral se elimina porque `search` ya cubre la marca
  (ej. `chanel`). La resolución del resultado semántico del home a un
  perfume por nombre exacto usa `search=<nombre>` (truncado a 5 tokens /
  100 caracteres para respetar la regla 7) y filtra por igualdad exacta de
  nombre en el cliente.
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
   error de validación 400 (protección de costo de consulta). Los límites se
   miden sobre el valor **normalizado** (ver regla 8), no sobre el crudo:
   - (a) El valor se **recorta (trim) antes de validar**: 100 caracteres
     reales más espacios a los lados es válido (200, no 400).
   - (b) Los tokens **duplicados se eliminan antes de contar** (comparación
     insensible a mayúsculas, se conserva la primera aparición): `a a a a a a`
     equivale a `a` y es válido; `a b c d e f` (6 tokens distintos) es 400.
     Coincide con el servicio, que ya deduplica (regla 4).
8. Normalización: antes de validar, el DTO transforma `search` a
   `tokens únicos unidos por un solo espacio` (trim, espacios múltiples
   colapsados, duplicados fuera). Un valor vacío tras normalizar equivale a no
   enviarlo (regla 6).
9. El carácter NUL (`\u0000`, `%00`) no puede almacenarse ni compararse en
   Postgres text; en vez de propagar un 500, el valor se rechaza con 400
   (código `CONTAINS_NUL_CHARACTER`). Regla transversal: aplica a `search` y a
   todos los query params de texto que alimentan una consulta (`concentration`,
   `olfactoryFamily`, `targetAudience`, `longevity` en fragrances; `name`,
   `email` en users; `name`, `websiteUrl` en vendors). Se **rechaza** y no se
   limpia, mismo criterio que `IsNotMarkup`/`IsNotProfane`: el valor consultado
   no debe diferir en silencio del enviado. La regla se extendio a body y params
   en `specs/nul-byte-rejection.md`.

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
- `name`/`brand` enviados por un cliente antiguo: ignorados (ver Contrato).
- `search=a%00b` → 400 (regla 9), nunca 500.
- `search` con 100 caracteres + espacios finales → 200 (regla 7a).
- `search=a a a a a a` → 200, equivale a `a` (regla 7b).
- `search` combinado con `concentration` u otros filtros exactos: se exigen todas las condiciones.

## Frontend: caja de búsqueda de `/fragrances`

Decisión: el cliente **acota en silencio** lo que escribe el usuario en vez de
mostrar un error: normaliza (trim, colapsa espacios, deduplica tokens
insensible a mayúsculas), elimina NUL/caracteres de control, y trunca a 5
tokens y 100 caracteres antes de llamar a la API. Un helper compartido
(`clampSearch`) lo usa tanto `getFragrances` (por lo que cubre la caja y
cualquier otro llamador) como `findFragranceByExactName`. Así escribir de más
nunca produce el panel de error por un 400.

## Fuera de alcance

- Ranking por relevancia (el orden sigue siendo por `id`).
- Tolerancia a typos / fuzzy, normalización de acentos.
- Búsqueda semántica (`/search`, similarityServer, perfumeCatalogImporter).
- Búsqueda en otros módulos (vendors, users).
