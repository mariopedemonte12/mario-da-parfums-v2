# backend-mcp-server — servidor MCP de catálogo/precios sobre el backend NestJS

## Contexto y relación con `platform-spec.md` §6 y `specs/chatbot-server.md`

`platform-spec.md` §6 fija que el chatbot accede a datos **solo** a través de
uno o más servidores **MCP**, de **solo lectura**, sobre fragancias, vendors,
precios y disponibilidad (buscar fragancia, comparar precios, encontrar el más
barato). `specs/chatbot-server.md` ya asume un diseño **modular multi-MCP**: el
chatbot se conecta a una lista configurable de servidores MCP y agrega sus
tools, cada uno namespaceado por id.

Este documento especifica **uno de esos servidores MCP**: el que expone
fragancias, vendors, listings (precio/disponibilidad) — es decir, todo lo que
hoy ya vive en `backend/` (NestJS + Drizzle, Postgres). El otro servidor MCP
(búsqueda semántica por descripción libre) es
[`specs/similarity-search-mcp.md`](similarity-search-mcp.md), un documento
aparte, con dueño distinto (`perfumeCatalogImporter/`).

**Decisión de esta sesión**: este servidor MCP vive **dentro de `backend/`**,
no como un proceso ni un paquete separado. Motivo: los datos que expone
(fragrances, vendors, listings) ya tienen su modelo, sus queries Drizzle y su
lógica de negocio en `FragrancesService`, `VendorsService` y `ListingsService`
— un servidor MCP aparte tendría que reimplementar ese acceso a datos (otra
conexión a Postgres, otro schema en otro lenguaje/proceso) sin ganar nada.
Montarlo dentro de `backend/` reusa esos services tal cual, vía inyección de
dependencias, como una entrada más al proceso Nest existente (junto a los
controllers REST), no un servicio nuevo a desplegar y mantener por separado.

## Qué hace, en términos generales

- Expone un servidor MCP sobre **HTTP** (transporte *streamable HTTP*, no
  stdio — el chatbot y el backend son procesos distintos en hosts
  potencialmente distintos, stdio no aplica), montado como una ruta adicional
  del mismo proceso Nest (p. ej. `POST /mcp`), **sin autenticación** en esta
  fase — mismo criterio que el resto de lectura pública de `platform-spec.md`
  §5.3 (comparar precios no requiere login) y que "sin autenticación de
  usuario" en `chatbot-server.md` §6.
- Las tools que expone son capas finas sobre los services existentes
  (`FragrancesService.findAll/findOne`, `VendorsService.findAll/findOne`,
  `ListingsService.findAll`) — **solo lectura**, ninguna tool crea, actualiza
  ni borra nada. No se agregan tools nuevas de negocio: se envuelve lo que el
  CRUD admin y la consulta pública ya resuelven (`fragrances-crud.md`,
  `vendors-crud.md`, `listings-crud.md`), adaptado a un formato que un agente
  LLM pueda invocar (input/output declarados por JSON schema, no DTOs de
  `class-validator` ligados a HTTP).
- Vive como un módulo más de Nest (p. ej. `src/mcp`), inyectando
  `FragrancesService`, `VendorsService`, `ListingsService` de sus módulos
  respectivos — no un fork paralelo de la lógica de negocio.

## Tools expuestas

Cubren exactamente el alcance funcional que `platform-spec.md` §5.3/§6 fija
para el chatbot (buscar fragancia, comparar precios entre vendors, encontrar
el más barato disponible, ver disponibilidad) — ninguna tool nueva más allá de
eso:

| Tool | Envuelve | Input | Output |
|---|---|---|---|
| `search_fragrances` | `FragrancesService.findAll` | `name?`, `brand?`, `concentration?`, `page?`, `limit?` | lista paginada de fragancias (id, nombre, marca, concentración, descripción) |
| `get_fragrance` | `FragrancesService.findOne` | `id` | una fragancia, o error si no existe |
| `list_vendors` | `VendorsService.findAll` | `name?`, `page?`, `limit?` | lista paginada de vendors (id, nombre, url) |
| `get_listings_for_fragrance` | `ListingsService.findAll` filtrado por `fragranceId` | `fragranceId`, `inStock?`, `minPrice?`, `maxPrice?` | listings de esa fragancia: vendor, tamaño, precio (CLP), `isAvailable`, url del producto — la base para "comparar precios" |
| `get_cheapest_listing` | `ListingsService.findAll` filtrado por `fragranceId` + `inStock=true`, ordenado por precio | `fragranceId` | el listing disponible más barato para esa fragancia, o un resultado vacío explícito si ninguno está disponible (no un error) |

- Los nombres de tool arriba son los que expone el `tools/list` del servidor
  — el namespacing con el id del servidor (p. ej. `catalog.search_fragrances`)
  lo agrega el lado chatbot (`chatbot-server.md` § "Registro modular de tools
  multi-MCP"), no este servidor.
- Paginación: mismos defaults/límites que sus respectivos endpoints REST
  (`fragrances-crud.md`, `vendors-crud.md`, `listings-crud.md`) — esta spec no
  define valores nuevos, hereda los ya acordados para no divergir entre la API
  REST y la vía MCP de los mismos datos.
- `get_cheapest_listing` es la única tool con lógica de ordenamiento propia
  (no existe hoy como endpoint REST dedicado) — se implementa reordenando el
  resultado de `ListingsService.findAll` por precio ascendente y tomando el
  primero con `isAvailable = true`; no es una tabla ni una query nueva, es
  composición sobre el mismo dato que ya expone `get_listings_for_fragrance`.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| `get_fragrance` con un `id` que no existe | resultado de tool de error (mensaje explícito), no una excepción que tumbe la conexión MCP |
| `get_cheapest_listing` sin ningún listing disponible para esa fragancia | resultado exitoso con valor vacío explícito (p. ej. `null`/lista vacía), no un error — "no hay stock" no es una falla |
| Falla de conexión a la base de datos al ejecutar una tool | resultado de tool de error; el proceso Nest sigue vivo, no se cae el servidor MCP ni el resto de la API REST |
| Input de una tool que no cumple su schema (p. ej. `fragranceId` con formato inválido) | resultado de tool de error de validación, mismo criterio de mensajes que ya usan los DTOs REST equivalentes |

Consistente con `chatbot-server.md`: una tool que falla nunca debe verse como
un crash de la conexión MCP — el chatbot espera poder comunicar en lenguaje
natural que no pudo obtener un dato puntual y seguir la conversación.

## Configuración

- Puerto/host: el mismo proceso y puerto que ya usa el backend Nest — no hay
  un puerto nuevo que configurar para el servidor MCP en sí, solo la ruta HTTP
  donde se monta (config, con un default razonable, p. ej. `/mcp`).
- Sin variables de entorno nuevas más allá de las que ya usa `backend/` para
  conectarse a Postgres (este módulo reusa la misma conexión Drizzle que el
  resto de la API, no una nueva).

## Fuera de alcance

- **Tools de escritura** (crear/editar/borrar fragancias, vendors o listings
  vía MCP) — ya fuera de alcance por `platform-spec.md` §6/§9; el CRUD admin
  sigue siendo exclusivamente vía REST.
- **Autenticación/autorización del endpoint MCP** — mismo criterio que el
  resto de lectura pública del backend en esta fase; si en el futuro el
  chatbot necesita identidad de usuario (favoritos personalizados), es un
  cambio de diseño aparte, ya anotado como fuera de alcance en
  `platform-spec.md` §9.
- **Favoritos vía MCP** — requeriría autenticación de sesión, explícitamente
  fuera de alcance por `platform-spec.md` §9.
- **Búsqueda semántica por descripción libre** — la resuelve el otro servidor
  MCP, [`similarity-search-mcp.md`](similarity-search-mcp.md); este servidor
  solo hace búsqueda estructurada (nombre/marca/concentración), la misma que
  ya ofrece el CRUD REST de fragancias.
- **Rate limiting / cuotas del endpoint MCP** — mismo criterio que
  `chatbot-server.md`, no hay noción de usuario en esta fase.
- **Tests** — se escriben en una sesión de testing separada sobre este mismo
  worktree, por la convención raíz del proyecto.
- **Infraestructura de despliegue** — mismo criterio que el resto del
  proyecto (`platform-spec.md` §9), se define después.
