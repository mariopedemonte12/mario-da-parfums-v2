# fragrance-notes-enrichment — structured olfactory family / audience / longevity columns

## Contexto

`similarityServer/data/perfumes_dataset.csv` (columnas `brand`, `perfume`,
`type`, `category`, `target_audience`, `longevity` — ver
`similarityServer/data/README.md` y `specs/perfume-catalog-import.md`)
trae tres campos que hoy `dataset_source.py` ya normaliza (`_AUDIENCE_MAP`,
`_LONGEVITY_MAP`) pero **solo** para alimentar `description_generator.py` —
nunca se persisten como columnas propias en `fragrances`
(`backend/src/database/schema/fragrance.schema.ts` solo tenía
`name`/`brand`/`concentration`/`description`/`imageUrl`).

Esta feature agrega esos tres campos como columnas estructuradas reales en
`fragrances`, para que el catálogo/diccionario de perfumes del frontend
pueda filtrar por familia olfativa e intensidad con datos reales (hoy esas
dos secciones del mock no tienen backing real).

**Fuera de alcance explícito, decidido con el usuario**: pirámide olfativa
(salida/corazón/fondo) — no existe en el dataset ni en ningún otro lado del
proyecto, no se simula.

## Alcance de esta sesión — solo `backend/`

Decisión explícita del usuario durante esta implementación: esta sesión
**solo toca `backend/`** (schema de Drizzle, DTOs, migración). No se modifica
`similarityServer/` en absoluto — ver "Hallazgo: el pipeline de
persistencia no existe" y "Fuera de alcance" más abajo para el detalle de
qué queda pendiente y para quién.

## Hallazgo: el pipeline de persistencia de `similarityServer` no existe

Al investigar antes de implementar (`similarityServer/repository.py`,
`orchestrator.py`) se confirmó que **`FragranceRepository.upsert()` y
`CatalogSyncOrchestrator.run()` son stubs `NotImplementedError`** — no hay,
hoy, ningún código que efectivamente inserte o actualice filas en
`fragrances` desde este pipeline, pese a que `specs/perfume-catalog-import.md`
describe ese comportamiento como si ya estuviera construido. No existen
tests unitarios para `dataset_source.py`, `repository.upsert`, ni
`orchestrator.run` (`similarityServer/tests/` no tiene
`test_dataset_source.py`, `test_repository.py` ni `test_orchestrator.py`;
solo hay tests para `similarity.py`/`index_sync.py`/`app.py`, que no dependen
de esa ruta).

**Consecuencia directa para el backfill (ver más abajo): no hay ninguna fila
importada por este pipeline en ninguna base real** — `upsert()` nunca corrió
en producción porque nunca tuvo cuerpo. Cualquier fila que exista hoy en
`fragrances` llegó por otra vía (el CRUD admin de `backend/src/fragrances`).

**Queda fuera de alcance de esta sesión** (por decisión explícita del
usuario) implementar `upsert()`/`run()`, agregar los tres campos a
`models.CatalogFragrance`, poblarlos en `dataset_source.py`, o persistirlos
en `repository.py`. Es trabajo real y necesario para que el dato llegue a
producción, pero es una sesión/feature aparte sobre `similarityServer/`
— no una continuación de este cambio de schema. Quien retome ese trabajo
debe:
- Agregar `olfactory_family: str | None`, `target_audience: str | None`,
  `longevity: str | None` a `CatalogFragrance` (`models.py`).
- Poblarlos en `dataset_source.py` reusando `_AUDIENCE_MAP`/`_LONGEVITY_MAP`
  ya existentes (hoy esos valores normalizados se computan como variables
  locales de `_parse_row` y se descartan tras alimentar
  `generate_description`; solo falta no descartarlos).
- Implementar `FragranceRepository.upsert()` (hoy inexistente) incluyendo
  estas tres columnas junto con las que ya existían.
- Implementar `CatalogSyncOrchestrator.run()` (hoy inexistente).
- `description_generator.py` no cambia: sigue recibiendo estos mismos datos
  como parámetros y generando la prosa igual que hoy; no hay conflicto entre
  guardarlos estructurados y seguir usándolos para la descripción.

**Actualización — resuelto en `worktree-perfume-catalog-import`**: todo lo
de arriba (implementar `upsert()`/`run()`, agregar los tres campos a
`CatalogFragrance`, poblarlos en `dataset_source.py`, persistirlos en
`repository.py`) se implementó en esa feature — ver
`specs/perfume-catalog-import.md`, sección "Reglas de negocio", bullet de
`olfactoryFamily`/`targetAudience`/`longevity`. Este documento se deja
intacto como registro de lo que era cierto al momento de escribirlo.

## Cambio de esquema (`backend/src/database/schema/fragrance.schema.ts`)

Tres columnas nuevas, todas nullable, sin default — mismo patrón que
`concentration` (`specs/fragrances-crud.md`):

| columna (DB) | campo (TS) | tipo | nullable | índice |
|---|---|---|---|---|
| `olfactory_family` | `olfactoryFamily` | `varchar(128)` | sí | `fragrances_olfactory_family_idx` (btree) |
| `target_audience` | `targetAudience` | `varchar(32)` | sí | — |
| `longevity` | `longevity` | `varchar(32)` | sí | `fragrances_longevity_idx` (btree) |

- **Nombres de columna**: `olfactoryFamily`/`targetAudience`/`longevity`
  (sugeridos en la tarea original), consistentes con el criterio ya usado en
  el schema (camelCase en TS, snake_case en Drizzle vía el segundo argumento
  de `varchar(...)`).
- **Tipo**: `varchar` nullable, igual que `concentration` — **no** un enum
  de Postgres ni `IsEnumField` en el DTO, pese a que los tres campos tienen
  un vocabulario cerrado conocido del lado del importador
  (`_AUDIENCE_MAP`/`_LONGEVITY_MAP` en `dataset_source.py`). Se sigue el
  mismo criterio que ya eligió el proyecto para `concentration` (que
  también tiene un vocabulario semi-cerrado del lado del importador vía
  `_CONCENTRATION_MAP`, pero es `varchar` libre en el backend): la
  normalización de vocabulario es responsabilidad del importador, no una
  restricción de schema en el backend, para no bloquear un valor legítimo
  que el CRUD admin quiera guardar y que el importador no contemple.
- **`olfactoryFamily`** guarda la columna `category` del dataset (familia
  olfativa, ej. "Woody Spicy") — se renombra en el backend porque `category`
  es ambiguo/genérico; `olfactoryFamily` es específico del dominio.
- **Longitudes**: `olfactoryFamily` 128 (igual que `brand`/`concentration`,
  categorías compuestas como "Woody Spicy" caben cómodo); `targetAudience`
  y `longevity` 32 (valores normalizados cortos: "Unisex", "Medium-Strong",
  "Very Strong").
- **Índices**: `olfactoryFamily` y `longevity` sí, porque son los dos
  filtros de catálogo pedidos (familia olfativa e intensidad) — mismo
  criterio que `fragrances_brand_idx` ya existente. `targetAudience` **no**
  lleva índice: no fue pedido como filtro de catálogo en esta tarea (solo
  "familia olfativa e intensidad"); se agrega si una sesión futura lo
  necesita como filtro real.

## Backfill de filas ya importadas — **no aplica**

Ver "Hallazgo" arriba: no existe ninguna fila en ninguna base real que haya
sido insertada por `similarityServer` (su `upsert()` nunca tuvo
cuerpo), así que no hay filas preexistentes que backfillear. Las tres
columnas nuevas simplemente quedan `NULL` para toda fila existente hasta que
un import real (implementado en la sesión pendiente descrita arriba) las
pueble.

## Migración

Generada con `pnpm db:generate` (`drizzle-kit generate`, no requiere
`DATABASE_URL` — solo diffea contra los snapshots en `drizzle/meta/`, no se
conecta a una DB real): `drizzle/0002_famous_colonel_america.sql`.

```sql
ALTER TABLE "fragrances" ADD COLUMN "olfactory_family" varchar(128);
ALTER TABLE "fragrances" ADD COLUMN "target_audience" varchar(32);
ALTER TABLE "fragrances" ADD COLUMN "longevity" varchar(32);
CREATE INDEX "fragrances_olfactory_family_idx" ON "fragrances" USING btree ("olfactory_family");
CREATE INDEX "fragrances_longevity_idx" ON "fragrances" USING btree ("longevity");
```

**No se corrió contra una DB real** — no hay `DATABASE_URL` configurado en
este entorno, mismo criterio que dejó `specs/fragrances-crud.md` para su
propia primera migración: queda generada y documentada, a cargo de quien
tenga `DATABASE_URL` correr `pnpm db:migrate`.

## DTOs y filtros (`backend/src/fragrances/`)

Los tres campos siguen exactamente el patrón ya establecido por
`concentration` en `CreateFragranceDto`/`UpdateFragranceDto` (vía
`PartialType`)/`ResponseFragranceDto`/`FindFragranceDto`: opcionales,
`string`, validados con `IsStringField`/`MaxLen`, sin regla `required`.

| campo | tipo | requerido | validación | filtro en `FindFragranceDto` |
|---|---|---|---|---|
| `olfactoryFamily` | string | no | string si viene, máx. 128 | exacto (`eq`) |
| `targetAudience` | string | no | string si viene, máx. 32 | exacto (`eq`) |
| `longevity` | string | no | string si viene, máx. 32 | exacto (`eq`) |

`FragrancesService.findAll` agrega las tres condiciones al arreglo de
`conditions` ya existente, mismo patrón que `brand`/`concentration` (match
exacto vía `eq`, no `ilike`).

### `ValidationErrorCode` nuevos (`src/shared/enums/validation-error-code.enums.ts`)

Mismo patrón que `CONCENTRATION_INVALID_TYPE`/`CONCENTRATION_TOO_LONG` (no
hay código `_REQUIRED` porque los tres campos son opcionales):

- `OLFACTORY_FAMILY_INVALID_TYPE`, `OLFACTORY_FAMILY_TOO_LONG`
- `TARGET_AUDIENCE_INVALID_TYPE`, `TARGET_AUDIENCE_TOO_LONG`
- `LONGEVITY_INVALID_TYPE`, `LONGEVITY_TOO_LONG`

## Fuera de alcance

- **Todo `similarityServer/`** — ver "Hallazgo" arriba. Ni el agregado
  de campos a `CatalogFragrance`, ni poblarlos en `dataset_source.py`, ni
  implementar `FragranceRepository.upsert()`/`CatalogSyncOrchestrator.run()`
  (que hoy no existen en absoluto, con o sin estos tres campos).
- **Pirámide olfativa** (salida/corazón/fondo) — no existe en el dataset ni
  en ningún otro lado del proyecto; no se simula ni se agrega como columna.
- **`src/mcp/tools/register-catalog-tools.ts`** (`search_fragrances`) — su
  `inputSchema` zod hoy solo expone `name`/`brand`/`concentration`, no se
  extendió a los tres campos nuevos. Es un módulo aparte (chatbot/MCP) que
  no fue parte del pedido de esta tarea; una sesión futura que quiera
  exponer estos filtros al chatbot debe tocarlo explícitamente.
- **Frontend** — no se toca; esta feature solo habilita el dato en el
  backend para que otra sesión lo consuma.
- **Correr la migración contra una DB real** — ver "Migración" arriba.
- **Tests nuevos que validen esta feature end-to-end** — corresponde a una
  sesión de testing aparte, per la convención raíz.
