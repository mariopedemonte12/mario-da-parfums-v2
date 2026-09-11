# fragrances — CRUD module + imageUrl migration

## Contexto

El módulo `fragrances` existe hoy solo como scaffold de `nest g resource` (controller/service son stubs, DTOs vacíos, no toca la DB). Esta feature lo implementa completo y cambia cómo se guarda la imagen del perfume.

## Cambio de esquema

- Se elimina la columna `s3_key_image` (`s3KeyImage`) de `fragrances`.
- Se agrega `image_url` (`imageUrl`): `varchar(500)`, nullable. La URL la produce un proceso de webscraping externo (fuera de alcance de este módulo); el CRUD de `fragrances` solo la almacena, valida y expone — no hace scraping.
- No existían migraciones generadas todavía en el proyecto (`drizzle/` no existe). El cambio se aplica directo en `src/database/schema/fragrance.schema.ts`; generar la migración inicial (`drizzle-kit generate`) queda a cargo de quien tenga `DATABASE_URL` configurado, porque sería la primera migración de todo el schema (todas las tablas), no solo de `fragrances`.

## Alcance del CRUD

Acceso: **todo el módulo es admin-only** (`JwtAuthGuard` + `RolesGuard` + `@Roles(Role.ADMIN)` a nivel de controller, todas las rutas incluidas las de lectura).

Endpoints (según `module-standards`: create/update/delete son batch-only, no se mantienen los de un solo ítem):

- `GET /fragrances` — listado con filtros server-side (`name` contains, `brand` exact, `concentration` exact) + paginación (`page`, `limit`, límite máximo enforced).
- `GET /fragrances/:id` — detalle por id (uuid).
- `POST /fragrances/batch` — alta múltiple, body `{ items: CreateFragranceDto[] }`.
- `PATCH /fragrances/batch` — edición múltiple, body `{ items: (UpdateFragranceDto & { id: string })[] }`.
- `DELETE /fragrances/batch` — baja múltiple, body `{ ids: string[] }`.

Todas las respuestas de batch reportan resultado por ítem (`{ id, success, error? }`) — partial-success por defecto, no transaccional (no hay requerimiento del negocio que pida todo-o-nada). Esto aplica sin excepción a `DELETE /fragrances/batch` también: un error de DB al borrar un ítem (el que sea) se reporta como `{ id, success: false, error }` para ese ítem, sin abortar el resto del batch.

**Borrado de una fragrancia → cascade sobre sus `listings`:** `listings.fragranceId` referencia a `fragrances.id` con `onDelete: 'cascade'`. Borrar una fragrancia borra también todos los `listings` que la referencian; no queda bloqueado por la FK ni requiere borrar los listings a mano primero. Decisión acordada con el usuario: no tiene sentido conservar un listing de venta para una fragrancia que ya no existe en el catálogo.

## Campos de `CreateFragranceDto`

| campo | tipo | requerido | validación |
|---|---|---|---|
| `name` | string | sí | no vacío, string, único a nivel DB (constraint ya existe) |
| `brand` | string | sí | no vacío, string |
| `concentration` | string | no | string si viene |
| `description` | string | no | string si viene |
| `imageUrl` | string (URL) | no | ver validación de imagen abajo |

`UpdateFragranceDto` deriva de `CreateFragranceDto` vía `PartialType`.

## Validación de `imageUrl` — decisión acordada

Se discutió si conviene que un `class-validator` custom haga una request HTTP real para confirmar que la URL sirve una imagen. Se descartó hacerlo síncrono en el DTO por: latencia acoplada a cada create/update, dependencia de red externa en el hot path de escritura, riesgo de SSRF si un admin apunta la URL a un host interno, y tests de integración no-determinísticos.

**Enfoque acordado: híbrido.**

1. **Bloqueante, en el DTO** (`class-validator` custom, sin red): la URL debe ser una URL http(s) bien formada y con extensión de imagen (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`, con o sin query string después). No garantiza que el contenido exista o sea realmente una imagen — solo la forma. Implementado en `src/validators/is-image-url.validator.ts`.
2. **No bloqueante, con chequeo real (HTTP + Content-Type)**: se hace en un **job separado, fuera de este backend** — decisión del usuario. Este módulo no implementa ningún endpoint ni utilidad de verificación HTTP; solo guarda y expone `imageUrl` tal como llega, validada por forma.

## Fuera de alcance

- El scraper que obtiene la `imageUrl` real (otro sistema/feature).
- La verificación real (HTTP) de que `imageUrl` sirve una imagen — se hace en un job separado fuera de este backend, no en este módulo.
- Migraciones de Drizzle (generar/correr) — requiere `DATABASE_URL`, se deja para cuando se levante la DB.
- Seeds: `fragrances` es referenciado por FK desde `listings`, pero `listings`/`vendors` siguen siendo scaffold sin implementar y no existe todavía ningún runner de seeds en el proyecto. No se construye infraestructura de seeds nueva solo para esta feature; queda pendiente para cuando se implemente `listings` (que es quien primero necesitaría poblar `fragrances` para sus propias pruebas).
- Frontend / consumo del endpoint de verificación.

## Errores

Sigue el esquema global (`docs/error-handling.md`) para lo que no es batch: validación de DTO → 400 con `FieldError[]` vía `ValidationErrorCode` (se agregan códigos nuevos para `brand`, `concentration`, `description`, `imageUrl`; `name` reutiliza `NAME_REQUIRED`/`NAME_INVALID_TYPE` ya existentes). `GET /fragrances/:id` no encontrado → `NotFoundException` (404). Sin rol admin → `ForbiddenException` (403, vía `RolesGuard`). Sin token → `UnauthorizedException` (401, vía `JwtAuthGuard`).

`name` duplicado **no** es un `ConflictException` (409): como las mutaciones son batch-only (ver "Alcance del CRUD"), un `name` duplicado en `POST/PATCH /fragrances/batch` se reporta como fallo por-ítem (`{ success: false, error: 'Fragrance "X" already exists' }`) dentro de una respuesta 200/201, igual que cualquier otro error de escritura — nunca aborta el batch entero con un 409. Esta corrección reemplaza una versión anterior de este documento que mencionaba 409, contradiciendo la regla de partial-success ya establecida arriba.
