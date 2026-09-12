# fragrantica-scraper — job semanal de catálogo (Fragrantica)

## Contexto

Implementa el **worker de catálogo** descrito en [`platform-spec.md`](../platform-spec.md) §4.1,
y referenciado como "fuera de alcance" tanto en
[`fragrances-crud.md`](./fragrances-crud.md) ("El scraper que obtiene la `imageUrl`
real") como en `backend/src/fragrances/NOTES.md`. Es un script standalone en Python,
pensado para correr semanalmente, que hace scraping de Fragrantica y escribe **directo
a la tabla `fragrances` de Postgres** — no pasa por la API REST del backend ni por
Drizzle (`psycopg2` + SQL puro). Debe respetar las mismas constraints de schema que
el backend ya definió (unicidad de `name`, columnas físicas de
`backend/src/database/schema/fragrance.schema.ts`).

Este documento define comportamiento y reglas de negocio del script — no nombres de
clases, módulos ni estructura de código (eso vive en las guidelines de
`fragranticaScraper/CLAUDE.md`).

## Qué hace

- Recorre el catálogo de Fragrantica (o un subconjunto acotado en esta fase de
  prueba, per `platform-spec.md` §8) y por cada perfume encontrado obtiene: `name`,
  `brand`, `concentration`, `description`, `imageUrl`.
- Por cada perfume scrapeado, hace upsert en `fragrances`:
  - Si no existe una fila con ese `name` (el único constraint unique existente hoy)
    → `INSERT`.
  - Si ya existe → `UPDATE` de `brand`/`concentration`/`description`/`image_url`,
    con bump explícito de `updated_at`. La tabla `fragrances` **no tiene** un
    trigger/default de DB para `updated_at` (a diferencia de `vendors.updates_at`,
    que sí tiene `$onUpdateFn` a nivel de Drizzle) — como este script escribe con
    SQL puro y no pasa por Drizzle, es responsabilidad del propio script fijar
    `updated_at = now()` en cada `UPDATE`.
- No crea ni modifica `vendors` ni `listings` — eso es responsabilidad exclusiva
  del job diario (otro worker, no implementado por este script).
- No descubre precios ni disponibilidad de ningún vendor.

## Reglas de negocio

- **Re-scrape completo en cada corrida.** No hay delta/incremental en esta fase —
  optimizarlo (detectar solo lo que cambió desde la corrida anterior) es trabajo
  futuro explícitamente diferido (`platform-spec.md` §4.1 y §8). El diseño de datos
  no debe impedir agregar más adelante algo como "última vez visto en Fragrantica",
  pero no es requisito implementarlo ahora.
- **`name` es la clave de matching contra la DB** (es el único índice unique que
  existe hoy en `fragrances`). Si Fragrantica tuviera dos perfumes con el mismo
  `name` pero `brand` distinta, el segundo violaría ese constraint. No es una
  condición esperada en operación normal, pero el script **no debe abortar toda la
  corrida** por esto: se loguea como fallo de ese ítem puntual y se continúa con el
  resto del catálogo — mismo espíritu partial-success que ya usa el resto del
  proyecto para operaciones batch (ver `fragrances-crud.md`, `listings-crud.md`).
- **`imageUrl`**: antes de guardarla, debe pasar la misma validación de forma que ya
  usa el módulo `fragrances` del backend (`is-image-url.validator.ts` /
  `create-fragrance.dto.ts`): URL http(s) bien formada, con extensión de imagen
  (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`, con o sin query string
  después). Si Fragrantica no expone imagen para ese perfume, o la URL no cumple
  ese formato, se guarda `null` — nunca una URL con forma inválida. Este script no
  hace la request HTTP para confirmar que la URL sirve contenido real; esa
  verificación sigue fuera de alcance (job separado, ya definido así en
  `fragrances-crud.md`).
- **`name` y `brand` son obligatorios** (igual que `CreateFragranceDto`): si el
  scraper no logra extraer alguno de los dos para un perfume dado, ese perfume se
  descarta — se loguea, no se inserta una fila incompleta — y se sigue con el resto
  del catálogo.
- **`concentration` y `description` son opcionales** — se guardan `null` si
  Fragrantica no los expone para ese perfume puntual.
- **Una falla de red/parseo de un perfume puntual no aborta la corrida completa**
  (timeout, cambio de estructura HTML, 404, contenido inesperado, etc.): se loguea
  el fallo de ese ítem y se continúa con el siguiente. Esto es un requisito, no una
  opción — la corrida es semanal y desatendida; no puede depender de que cada
  perfume individual funcione para que el resto del catálogo se actualice.
- **El script no debe golpear agresivamente el sitio de Fragrantica** (rate
  limiting entre requests), para no arriesgar un bloqueo/ban de IP que deje la
  corrida semanal inviable. El detalle concreto (delay, reintentos, backoff) es de
  implementación (ver guidelines), no una regla de negocio de este spec.
- **Al final de cada corrida el script reporta un resumen** (creados, actualizados,
  descartados/fallidos, con su motivo). Corre desatendido — el log/resumen es la
  única forma de detectar problemas de una corrida dada.

## Fuera de alcance

- Vendors, listings, precios y disponibilidad — responsabilidad exclusiva del job
  diario (otro worker standalone, no implementado por este script; ver
  `platform-spec.md` §4.2).
- Verificación real (HTTP + Content-Type) de que `imageUrl` sirve una imagen — job
  separado, ya definido como fuera de alcance en `fragrances-crud.md`.
- Descarga u hosting de la imagen — solo se persiste la URL de Fragrantica tal cual
  se encuentra, no se copian archivos a ningún storage propio.
- Delta/incremental scraping (detectar solo cambios respecto a la corrida anterior)
  — optimización futura explícitamente diferida (`platform-spec.md` §4.1, §8).
- Orquestación del cron/scheduler (systemd timer, GitHub Actions, cron propio,
  etc.) — decisión de infraestructura que se resuelve al final del proyecto
  (`platform-spec.md` §9). Este script solo debe ser invocable como una corrida
  standalone (ej. un comando de CLI); lo que sea que dispare la cadencia semanal lo
  invoca a él, no al revés.
- Reintentos/circuit-breaking por "vendor caído" — no aplica, este script no
  depende de vendors.
- Migraciones de schema — la tabla `fragrances` ya existe y la gestiona Drizzle
  desde el backend; este script solo hace `INSERT`/`UPDATE` de filas, nunca DDL.
- CRUD admin manual de fragancias — ya cubierto por `fragrances-crud.md`. En
  operación normal este script es la vía principal de llenado del catálogo; el CRUD
  admin queda como vía secundaria de corrección manual (`platform-spec.md` §3).
