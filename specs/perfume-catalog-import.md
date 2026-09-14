# perfume-catalog-import — catálogo sintético + búsqueda por similitud

## Contexto y por qué cambió de scope

Este documento reemplaza al spec original de un scraper vivo de Fragrantica
(ver historial de git, `specs/fragrantica-scraper.md`). Esa implementación
funcionó (bypaseaba el challenge de Cloudflare, parseaba microdata
`schema.org` correctamente) pero se decidió con el usuario **abandonarla por
riesgo legal de hacer scraping continuo de un sitio de terceros** — no por un
problema técnico. La decisión explícita fue: **simular** un scraper de
Fragrantica en espíritu (un catálogo grande de perfumes reales, con
`concentration` derivada de una señal del propio dato, no inventada al azar),
pero construido a partir de un **dataset estático de Kaggle** con marcas y
nombres de perfumes reales, **descripciones 100% inventadas** por este
proyecto (nunca copiadas de Fragrantica ni de ninguna fuente editorial), y un
componente chico de ML para hacerlo más interesante (búsqueda por similitud
de texto).

Sigue viviendo en `perfumeCatalogImporter/` (renombrado desde
`fragranticaScraper/`) porque el rol del paquete es el mismo — poblar
`fragrances` — solo cambió **de dónde sale el dato**. Referenciado como
"worker de catálogo" en [`platform-spec.md`](../platform-spec.md) §4.1
(actualizado para reflejar este cambio) y en `backend/src/fragrances/NOTES.md`.

## Qué hace

1. **Fuente de datos**: `perfumeCatalogImporter/data/perfumes_dataset.csv`,
   un dataset estático (no red, no scraping) — ["Perfume
   Dataset"](https://www.kaggle.com/datasets/ayushghawana/perfume-dataset) de
   Ayush (Kaggle user `ayushghawana`), licencia **CC BY 4.0** (atribución
   obligatoria — ver `perfumeCatalogImporter/data/README.md`, que es la
   atribución). Columnas: `brand`, `perfume`, `type`, `category`,
   `target_audience`, `longevity`. `brand`/`perfume` son marcas y nombres de
   perfumes reales; `category`/`target_audience`/`longevity` son metadatos
   del propio dataset — usados como insumo para generar la descripción
   sintética **y** persistidos como columnas estructuradas propias (ver
   punto 2 y `specs/fragrance-notes-enrichment.md`, que agregó esas tres
   columnas al schema; no se presentan como dato editorial de ninguna fuente
   real).
2. Por cada fila válida del CSV, construye `name`, `brand`, `concentration`,
   `description` (siempre generada, nunca copiada), `imageUrl` (siempre
   `null` — este dataset no trae fotos; ver "Fuera de alcance") y
   `olfactoryFamily`/`targetAudience`/`longevity` (los mismos valores
   limpios/normalizados que alimentan la descripción — `category` del
   dataset, `target_audience` normalizado vía `_AUDIENCE_MAP`, `longevity`
   normalizado vía `_LONGEVITY_MAP` — ver `dataset_source.py`).
3. Hace upsert en `fragrances` igual que el diseño original: `INSERT` si
   `name` no existe, `UPDATE` de `brand`/`concentration`/`description`/
   `image_url`/`olfactory_family`/`target_audience`/`longevity` con
   `updated_at = now()` explícito si ya existe (la tabla no tiene trigger de
   DB para `updated_at`, igual que antes).
4. Además del import, ofrece **búsqueda por similitud**: dado un texto libre
   ("algo fresco y cítrico para el verano"), devuelve las N fragancias cuya
   descripción generada es más cercana semánticamente (embeddings + similitud
   coseno). Ver "Búsqueda por similitud" más abajo.
5. No crea ni modifica `vendors` ni `listings` — sigue siendo responsabilidad
   exclusiva del job diario. No descubre precios ni disponibilidad.

## Reglas de negocio — import del catálogo

- **La clave de matching contra la DB es el par (`brand`, `name`), no `name`
  solo** — decisión corregida durante la sesión de testing de esta feature
  (2026-09-13): el índice unique original era solo sobre `name`, pero el
  dataset real trae perfumes homónimos de marcas distintas (ej. `"Theoreme"`
  existe como `Rue Broca` y como `Afnan`; `"Pour Homme EDT"` existe como
  `Dolce & Gabbana` y como `Azzaro`) — con `name` solo como clave, importar
  el segundo pisa silenciosamente los datos del primero (se pierde una
  fragancia real del catálogo sin ningún error ni log). El índice unique en
  `fragrances` pasa a ser compuesto (`brand`, `name`) — cambio de schema a
  cargo de una sesión de implementación aparte (Drizzle, `backend/`), no de
  este documento ni de este paquete Python.
- Mismo manejo que antes, ahora sobre la clave compuesta: **una colisión de
  (`brand`, `name`) entre dos filas del dataset se loguea como fallo
  puntual, no aborta la corrida completa.** Esto sigue siendo necesario
  incluso con la clave compuesta — el dataset real tiene pares
  `(brand, name)` idénticos con datos distintos en el resto de las columnas
  (ej. `Al Haramain` / `"Amber Oud Aqua Dubai"` aparece dos veces con
  `category`/`target_audience`/`longevity` diferentes), un caso genuinamente
  ambiguo (¿cuál de las dos filas es la fragancia real?) que debe
  descartarse con motivo, no resolverse arbitrariamente quedándose con "la
  que se procesó último".
- **`name` y `brand` son obligatorios** (igual que `CreateFragranceDto`): una
  fila del CSV sin alguno de los dos se descarta y se loguea, sin detener el
  resto del import.
- **`concentration` sale de la columna `type` del dataset, no de heurísticas
  de texto** (a diferencia del diseño de scraping original, donde había que
  inferirla de una descripción). El dataset ya trae el tipo explícito por
  fila; se normaliza a un vocabulario consistente:
  - `edp`/`EDP` → `Eau de Parfum`; `edt`/`EDT` → `Eau de Toilette`;
    `parfum`/`Parfum` → `Parfum`; `extrait`/`Extrait de Parfum` → `Extrait de
    Parfum`; `Cologne` → `Eau de Cologne`.
  - `Oil`, `Concentrate`, `Attar`, `Alcohol-free` se conservan casi tal cual
    (formatos reales, no forman parte del vocabulario "clásico" de
    concentraciones pero son valores válidos e informativos) — el campo es
    `varchar` libre en el backend, no un enum cerrado.
  - Nunca se descarta una fila por tener un `type` no reconocido: en el peor
    caso se guarda el valor original, normalizado en mayúscula inicial.
- **`description` es siempre generada, nunca `null` cuando hay `name` y
  `brand`** (a diferencia del scraper original, donde faltaba seguido). Ver
  "Generación de descripciones".
- **`imageUrl` es siempre `null`** — el dataset no trae fotos y este proyecto
  ya no hace scraping para conseguirlas. Sigue pasando por la misma
  validación de forma (`is-image-url.validator.ts`) por si en el futuro se
  vuelve a poblar desde otra fuente, pero hoy nunca hay un valor no-null que
  validar.
- **`olfactoryFamily`/`targetAudience`/`longevity` se persisten como columnas
  estructuradas** (agregadas al schema por `specs/fragrance-notes-enrichment.md`;
  antes de esta feature el importer las calculaba solo para armar
  `description` y las descartaba después, dejando esas tres columnas siempre
  en `null` para cualquier fila que tocara):
  - `olfactoryFamily` sale de `category` del dataset tal cual (recortado),
    sin normalizar — es `varchar` libre en el backend, igual que
    `concentration`.
  - `targetAudience`/`longevity` son los mismos valores normalizados
    (`_AUDIENCE_MAP`/`_LONGEVITY_MAP`) que ya alimentaban la descripción. Si
    el dataset trae un valor no reconocido, el campo queda `null` (no se
    inventa un valor ni se descarta la fila por esto — estos tres campos no
    son obligatorios, a diferencia de `name`/`brand`).
  - Se actualizan en el `UPDATE` igual que el resto de las columnas
    derivadas del dataset (`brand`/`concentration`/`description`/
    `image_url`): un re-import que corrige el dataset fuente corrige también
    estas tres columnas en filas ya existentes.
- **Calidad del CSV fuente — limpieza obligatoria antes de generar nada**:
  - El archivo trae su propio header duplicado como fila de datos más abajo
    (`brand='Brand', perfume='Perfume', type='Type', ...`) — se detecta y se
    descarta esa fila entera, no solo el campo `type`.
  - Varios valores de `longevity` traen residuos de citación de un LLM con
    browsing (ej. `"Medium :contentReference[oaicite:1]{index=1}"`) — se
    limpian antes de usar el campo, quedándose con el valor real
    (`"Medium"`).
  - `brand`/`perfume` mezclan casing correcto (`"Jean Paul Gaultier"`,
    `"Parfums de Marly"`) con todo-minúscula (`"dumont"`, `"paris corner"`).
    Se normaliza a Title Case **solo** cuando el valor original está
    completamente en minúscula (para no romper casos ya bien escritos como
    `"Parfums de Marly"` → `"Parfums De Marly"`), respetando un conjunto
    chico de conectores que quedan en minúscula (`de`, `of`, `for`, etc.)
    salvo que sean la primera palabra.
- **Una fila del CSV mal formada no aborta el import completo** — se loguea
  y se sigue, mismo espíritu partial-success que el resto del proyecto.
- **Re-import completo en cada corrida**, sin delta — el dataset es estático
  y chico (~1000 filas), no hay necesidad real de optimizar esto todavía.
- **Al final de la corrida se reporta un resumen** (creados, actualizados,
  descartados/fallidos, con motivo) — igual que el diseño original.

## Generación de descripciones (siempre sintéticas)

- Cada descripción es una plantilla en español rellenada con `brand`, `name`,
  `category` (familia olfativa del dataset, ej. "Woody Spicy"),
  `target_audience` (Male/Female/Unisex, normalizado desde variantes
  `Men`/`Women`) y `longevity` (Light .. Very Strong, normalizado). Nunca es
  texto copiado de ninguna fuente — es explícitamente marketing inventado a
  partir de metadatos estructurados.
- **Determinística por (`brand`, `name`)**: la plantilla elegida depende de
  un seed fijo derivado de esos dos campos, así una fila que no cambió entre
  corridas no genera una descripción distinta cada vez (evita ruido/diffs
  espurios en `updated_at`).
- Si `category`/`target_audience`/`longevity` faltan o no se reconocen, la
  plantilla los omite en vez de inventar un valor — solo `brand`/`name`/
  `concentration` son obligatorios para generar algo.

## Búsqueda por similitud

- Objetivo: dado un texto libre describiendo lo que alguien busca ("algo
  fresco y cítrico para el verano"), devolver las fragancias del catálogo
  cuya descripción generada es más cercana semánticamente.
- **Mecanismo**: embeddings de texto + similitud coseno. Se embeben todas las
  descripciones generadas una vez (al construir/actualizar el índice); una
  búsqueda embebe el texto de consulta con el mismo modelo y rankea por
  coseno contra ese índice.
- **Modelo**: `paraphrase-multilingual-MiniLM-L12-v2` (`sentence-transformers`),
  corriendo localmente — sin API key, sin costo por request, funciona
  offline. Decisión explícita del usuario frente a la alternativa de una API
  de embeddings hosteada, priorizando no depender de un proveedor externo
  pago por sobre el tamaño de la dependencia (trae `torch`).
- **Alcance de esta fase — prototipo, no servicio de producción**: el índice
  vive en un archivo local (`.npz`, nombre/embedding por fragancia), no hay
  base de datos vectorial ni endpoint HTTP expuesto todavía.
- **Exponerlo como servicio queda documentado aparte**: ver
  [`perfume-similarity-search.md`](./perfume-similarity-search.md) — decisión
  ya tomada con el usuario de que esto se sirve desde un servidor **FastAPI
  standalone** (el backend NestJS no debe cargar el modelo de embeddings ni
  correr encoders), a implementar en su propia sesión/worktree, no como
  continuación directa de este documento.

## Fuera de alcance

- Vendors, listings, precios y disponibilidad — responsabilidad exclusiva del
  job diario (`platform-spec.md` §4.2).
- **Cualquier scraping en vivo de Fragrantica o de cualquier otro sitio** —
  decisión explícita y deliberada de este cambio de spec, no un detalle
  técnico. Si en el futuro se quiere retomar scraping real, es una decisión
  de negocio nueva, no una continuación de este trabajo.
- Imágenes de los perfumes — el dataset no las trae; no hay plan en esta fase
  de conseguirlas de otra fuente. `imageUrl` queda `null` para todo el
  catálogo importado por este pipeline.
- Exponer la búsqueda por similitud como endpoint — ver
  `perfume-similarity-search.md`, feature aparte con su propia sesión. Esta
  fase entrega el mecanismo (construir el índice, buscar contra él) como
  módulo Python standalone/probado a mano, no una feature end-to-end con API.
- Reentrenar o afinar (fine-tune) el modelo de embeddings — se usa el modelo
  preentrenado tal cual.
- Migraciones de schema — la tabla `fragrances` ya existe y la gestiona
  Drizzle desde el backend; este script solo hace `INSERT`/`UPDATE` de filas,
  nunca DDL. El índice de similitud no vive en Postgres en esta fase (archivo
  local), así que tampoco requiere una migración para el embedding en sí.
- Orquestación de cron/scheduler — igual que antes, decisión de
  infraestructura para más adelante (`platform-spec.md` §9).
- CRUD admin manual de fragancias — ya cubierto por `fragrances-crud.md`.
