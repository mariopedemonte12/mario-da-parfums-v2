# price-generator — generador determinístico de precios falsos

## Contexto y relación con `platform-spec.md` §4.2

[`platform-spec.md`](../platform-spec.md) §4.2 define el "job diario" (**Worker
de precios**): por cada `Fragrance`, buscar su precio en cada `Vendor` activo
y dejar reflejado el precio vigente en `Listing`, actualizando in-place.

Hacer eso con scraping real de retailers chilenos reconocidos es legalmente
complejo (scraping continuo de sitios de terceros) y de mala reputación para
el proyecto — el mismo motivo por el que `similarityServer` abandonó el
scraping en vivo de Fragrantica (ver
[`perfume-catalog-import.md`](./perfume-catalog-import.md), sección
"Contexto y por qué cambió de scope"). Se sigue el mismo patrón acá: en vez de
scrapear vendors reales, este script **inventa tanto los vendors como los
precios**, generándolos de forma determinística a partir de las fragancias ya
presentes en la base. Los vendors y precios producidos no representan a
ningún retailer real — ver "Vendors falsos" más abajo.

Este documento **actualiza el entendimiento de §4.2 para la fase actual**: la
regla de negocio de §4.2 (una sola fila `Listing` por `(fragranceId, vendorId,
tamaño)`, actualizada in-place; `isAvailable`/`in_stock` para delisting sin
borrar precio; sin historial de precios) sigue vigente tal cual y este script
la implementa — lo único que cambia es **de dónde sale el precio**: no de un
scraper real, sino de un generador pseudoaleatorio determinístico. Si en el
futuro se retoma scraping real, es una decisión de negocio nueva (mismo
lenguaje que usa `perfume-catalog-import.md` para el mismo tipo de cambio).

## Qué hace, en orden

1. Lee de la base todas las `fragrances` existentes (`id`, `name`).
2. Asegura que exista en `vendors` la lista fija de vendors falsos (ver
   "Vendors falsos") — creación idempotente, nunca pisa un vendor que ya
   existe.
3. Para cada combinación `(fragrance, vendor)` — **todas las fragancias por
   todos los vendors falsos, sin subconjuntos** (cobertura total, ver
   "Cobertura") — genera de forma determinística un precio (CLP), un tamaño
   (ml) derivado de ese precio, y si está disponible (`in_stock`).
4. Hace upsert en `listings` por la clave `(vendor_id, perfume_id, size_ml)`
   igual que exige §4.2: `INSERT` si la combinación no existía, `UPDATE` de
   `price`/`url`/`in_stock`/`scraped_at` si ya existía. Nunca crea una
   segunda fila para una combinación que ya tiene una.
5. Al final de la corrida reporta un resumen (vendors asegurados, listings
   creados, listings actualizados, fallidos) — mismo espíritu que
   `similarityServer`.

Correr el script de nuevo sobre los mismos datos no cambia ningún precio
existente (ver "Determinismo") — solo actualiza `scraped_at` y agrega filas
para fragancias/vendors nuevos desde la corrida anterior.

## Vendors falsos

Lista fija de vendors inventados que vive en el propio script (no viene de
ninguna fuente externa). Deben ser **claramente ficticios** — no nombres ni
dominios que se parezcan a retailers chilenos reales (Falabella, Paris,
Ripley, DBS, Jumbo, etc.), mismo motivo legal/reputacional que motiva todo
este documento. Los dominios usan `.example.com`, igual que los vendors de
fixture existentes en `backend/src/database/seeds/vendors.seed.ts`, para que
nunca puedan resolver a un sitio real:

| name                  | websiteUrl                                      |
|-----------------------|--------------------------------------------------|
| Aromas del Pacífico   | `https://www.aromasdelpacifico.example.com`       |
| Botica Andina         | `https://www.boticaandina.example.com`            |
| EsenciaClub           | `https://www.esenciaclub.example.com`             |
| Perfumería Austral    | `https://www.perfumeriaaustral.example.com`       |
| Fragancia Express     | `https://www.fraganciaexpress.example.com`        |

- Se insertan una sola vez cada uno (`INSERT ... ON CONFLICT (name) DO
  NOTHING`, coherente con la unicidad de `vendors.name`): si un admin editó
  después el `websiteUrl` de alguno vía el CRUD (`vendors-crud.md`), este
  script **no lo pisa** en corridas siguientes — solo garantiza que la fila
  exista, no que tenga siempre estos valores.
- Este script trata **todos** los vendors presentes en `vendors` como
  "activos" para efectos de §4.2 — el schema actual no tiene un flag
  `active`/`inactive` en `vendors`, así que no hay nada que filtrar. Si en el
  futuro se agrega ese flag, este script debe empezar a respetarlo (fuera de
  alcance hoy).
- Ampliar o cambiar esta lista es editar el spec (y el código), no un dato de
  configuración por entorno — es intencionalmente un valor fijo, chico y
  legible.

## Cobertura

Cada fragancia recibe exactamente un `Listing` en cada uno de los 5 vendors
falsos — cross join completo, sin subconjuntos pseudoaleatorios. Decisión
explícita del usuario por simplicidad: maximiza los datos disponibles para
probar comparación de precios y evita una capa extra de lógica de "qué vendor
vende qué".

## Generación de precio y ml — regla de negocio

**Precio primero, ml derivado del precio** (no al revés): se genera un precio
pseudoaleatorio determinístico dentro de un rango global razonable para
perfumes en Chile, y el tamaño se deriva de ese precio por tramos fijos —
mismo espíritu que "precio más grande → botella más grande" del mercado real.

- **Rango de precio**: CLP $15.000 – $150.000 (entero, moneda CLP fija por
  `platform-spec.md` §1).
- **Redondeo "de vidriera"**: el precio final siempre termina en `990` (p.
  ej. `$34.990`), como el pricing psicológico habitual de retail — no un
  entero crudo del generador.
- **Tramos precio → ml** (el precio ya redondeado a `990` es el que se
  evalúa):

  | Precio (CLP)              | Tamaño (ml) |
  |----------------------------|-------------|
  | `< 40.000`                 | 30           |
  | `40.000` – `69.990`        | 50           |
  | `70.000` – `109.990`       | 75           |
  | `>= 110.000`                | 100          |

- Cada `(fragrance, vendor)` produce **un solo** `Listing` (un solo tamaño) —
  no se simulan varios tamaños por vendor para la misma fragancia en esta
  fase (el schema lo permitiría, pero no es parte de este generador).

## Disponibilidad (`in_stock`)

Simula el flag de delisting de §4.2 con datos falsos: una fracción
determinística de los listings se genera con `in_stock = false`, el resto
`true`.

- **Tasa**: ~10% de las combinaciones `(fragrance, vendor)` quedan
  `in_stock = false`. El 10% es una decisión de este spec, no una medición —
  ajustable después sin cambiar la regla de negocio.
- El precio y el ml se calculan igual para un listing no disponible — no se
  omiten ni se ponen en `null` (la columna `price`/`size_ml` no son
  nullable). Esto es consistente con la regla de §4.2 de "se conserva el
  último precio conocido" cuando algo deja de estar disponible: acá, como
  todo es determinístico y no hay corrida anterior con un precio distinto, el
  precio "conservado" es simplemente el mismo que siempre se calculó para esa
  combinación.
- Qué combinaciones caen en el 10% también es determinístico (ver
  "Determinismo") — no cambia de corrida en corrida para los mismos
  `fragranceId`/`vendorId`.

## Determinismo

Requisito central: **correr el script dos veces sobre la misma base produce
exactamente los mismos precios, tamaños y disponibilidad** — no hay
simulación de variación día a día en esta fase (eso sería una feature nueva,
explícitamente fuera de alcance, ver abajo).

- La semilla pseudoaleatoria para cada combinación `(fragranceId, vendorId)`
  se deriva con un hash **estable entre procesos** (p. ej. `hashlib.sha256`
  sobre `f"{fragrance_id}:{vendor_id}"`, nunca el `hash()` built-in de
  Python — ese hash de strings está aleatorizado por proceso vía
  `PYTHONHASHSEED` salvo que se desactive globalmente, así que dos corridas
  del mismo binario en dos procesos distintos darían semillas distintas si se
  usara).
- Con esa semilla se instancia un `random.Random(seed)` **propio de esa
  combinación** (no el módulo `random` global ni una instancia compartida
  entre combinaciones) y de ahí se derivan, en orden fijo: el precio crudo
  dentro del rango, y el roll de disponibilidad. El orden importa para que el
  resultado sea reproducible incluso si en el futuro se agrega un tercer
  valor derivado.
- No hay ningún input de fecha/hora/entorno en la semilla — determinismo total
  independiente de cuándo se corre.

## Persistencia

- **`vendors`**: columnas `id` (serial), `name` (varchar 128, unique),
  `website_url` (varchar 255), `created_at`/`updated_at` (server-set). Debe
  matchear exactamente `backend/src/database/schema/vendor.schema.ts`.
- **`listings`**: columnas `id` (serial), `perfume_id` (uuid, FK a
  `fragrances.id`), `vendor_id` (integer, FK a `vendors.id`), `size_ml`
  (integer), `price` (integer, CLP), `url` (varchar 500), `in_stock`
  (boolean), `scraped_at` (timestamp). Debe matchear exactamente
  `backend/src/database/schema/listing.schema.ts`, incluyendo el índice único
  `(vendor_id, perfume_id, size_ml)` que el upsert usa como conflict target.
- **`url`**: se genera de forma determinística a partir del `websiteUrl` del
  vendor y el `name` de la fragancia (slug), p. ej.
  `{websiteUrl}/producto/{slug(name)}-{size_ml}ml`. No apunta a ningún
  producto real — es parte del dato inventado, no un intento de matching real
  contra el sitio del vendor (eso solo aplica al job real de §4.2, no a este
  generador).
- El script **nunca hace DDL** — las tablas ya existen y las gestiona Drizzle
  desde el backend; solo hace `INSERT`/`UPDATE` de filas, igual que
  `similarityServer`.
- SQL puro parametrizado vía `psycopg2` (`cursor.execute(sql, params)`),
  nunca f-strings/`%`-formatting para construir la query — mismo estándar que
  `similarityServer/CLAUDE.md`.

## Empaquetado como imagen Docker

- El script corre **una vez y termina** (proceso batch, no un daemon de larga
  vida ni con su propio scheduler/cron interno) — se limita a: conectar,
  generar, upsert, resumir, salir con código `0` en éxito o `!= 0` si la
  corrida completa falló (fallas puntuales por combinación no abortan el
  resto, igual que `similarityServer`).
- **Configuración vía variables de entorno**, sin valores hardcodeados: como
  mínimo `DATABASE_URL` (connection string de Postgres) y `LOG_LEVEL`. Sin
  secretos en el código ni en la imagen.
- La imagen Docker es el artefacto de entrega de esta fase: se construye y
  queda lista para ejecutarse en cualquier entorno que le pase `DATABASE_URL`
  apuntando a la base de Mario da Parfums. **No** se registra todavía en
  ningún scheduler de un proveedor cloud — eso es una decisión de
  infraestructura para el final del proyecto, ya acordada así con el usuario
  (`platform-spec.md` §9).

## Fuera de alcance

- **Scraping real de ningún vendor** — decisión explícita y deliberada de
  este documento, no un detalle técnico (mismo motivo que
  `perfume-catalog-import.md`). Retomar scraping real es una decisión de
  negocio nueva, no una continuación de este trabajo.
- **Simulación de variación de precio día a día** — el generador es
  puramente determinístico por `(fragranceId, vendorId)`; no hay ruido ni
  tendencia entre corridas. Si en el futuro se quiere simular fluctuación
  real, es una feature nueva sobre este diseño, no algo que este script deba
  producir hoy.
- **Historial de precios** — igual que §4.2, `Listing` guarda solo el precio
  actual.
- **Múltiples tamaños por combinación `(fragrance, vendor)`** — el schema lo
  permite (índice único incluye `size_ml`), pero este generador produce
  exactamente uno.
- **Subconjuntos de cobertura** ("no todos los vendors venden todo") — cross
  join completo, ver "Cobertura".
- **Flag `active`/`inactive` en `vendors`** — no existe en el schema actual;
  si se agrega, este script debe empezar a filtrar por él, pero eso es un
  cambio de schema aparte.
- **Registro del job en un scheduler/proveedor cloud** (cron, EventBridge,
  Cloud Scheduler, etc.) — solo se entrega la imagen Docker, no su
  orquestación (`platform-spec.md` §9).
- **Cualquier endpoint HTTP o API** — es un script batch standalone, igual
  categoría que `similarityServer`, no expone nada.
- **Migraciones de schema** — las tablas `vendors`/`listings`/`fragrances` ya
  existen y las gestiona Drizzle desde el backend.
- **Tests** — se escriben en una sesión de testing separada sobre este mismo
  worktree, per la convención raíz del proyecto.
