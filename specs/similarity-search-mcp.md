# similarity-search-mcp — el servicio FastAPI expone también un servidor MCP

## Contexto y relación con `platform-spec.md` §6, `perfume-similarity-search.md`
## y `chatbot-server.md`

[`perfume-similarity-search.md`](perfume-similarity-search.md) ya especifica e
implementa un servicio FastAPI (`perfumeCatalogImporter/app.py`) que sirve
búsqueda semántica de fragancias por descripción libre (embeddings +
similitud coseno aproximada vía HNSW), con `GET /search` y `GET /health`. Este
documento **no reabre esa implementación** — solo agrega una segunda forma de
acceder a la misma capacidad ya construida: un servidor **MCP**, para que el
chatbot (`chatbot-server.md`, diseño modular multi-MCP) pueda usarla como una
tool más, junto a las que expone
[`backend-mcp-server.md`](backend-mcp-server.md) (fragrances/vendors/listings
estructurados).

`platform-spec.md` §6 pide que el chatbot solo acceda a datos vía MCP; la
búsqueda semántica por descripción libre es parte de ese acceso a datos (una
forma alternativa de "buscar fragancia" a la búsqueda estructurada por
nombre/marca que expone `backend-mcp-server.md`), así que también debe
quedar detrás de un servidor MCP y no consumirse por HTTP plano desde el
chatbot.

**Decisión de esta sesión (acordada con el usuario): un solo proceso, un solo
container.** El servidor MCP **no es un servicio aparte** — se monta como una
segunda superficie del mismo proceso FastAPI que ya sirve `/search` y
`/health`, compartiendo el mismo índice en memoria (`app.state.index`,
`PerfumeSimilarityIndex`) y el mismo ciclo de vida (`lifespan`,
`IndexSyncService` corriendo una sola vez al arrancar). Se descartó un
servicio MCP separado por lo mismo que ya se descartó ubicar el acceso a
datos de fragrances/vendors/precios ahí: duplicaría el índice/encoder en
memoria (costoso, es justamente lo que se cuida en
`perfume-similarity-search.md`) sin ganar aislamiento real, dado que ambas
superficies exponen exactamente la misma capacidad de solo lectura sobre el
mismo estado in-process.

## Qué hace

- El mismo proceso `perfumeCatalogImporter/app.py` monta, junto a las rutas
  HTTP existentes, un servidor MCP sobre **HTTP** (transporte *streamable
  HTTP*, mismo motivo que en `backend-mcp-server.md`: el chatbot es un proceso
  Node separado, stdio no aplica) usando el **SDK oficial de MCP para Python**
  (`mcp`, `mcp.server.fastmcp.FastMCP` o equivalente), montado como sub-app
  ASGI en una ruta propia (p. ej. `/mcp`) del mismo `FastAPI()` — mismo
  puerto, mismo proceso, mismo container Docker que ya empaqueta este
  servicio (ver "Fuera de alcance" en `perfume-similarity-search.md` sobre
  dónde se despliega).
- Expone **una sola tool**, de solo lectura, que envuelve exactamente lo que
  ya hace `GET /search` — no se agrega capacidad nueva, solo un segundo
  transporte para la misma operación:

  | Tool | Envuelve | Input | Output |
  |---|---|---|---|
  | `search_similar_fragrances` | `PerfumeSimilarityIndex.search()` (mismo índice en memoria que usa `GET /search`) | `query` (texto libre), `top_k?` (default 5, máximo 50 — mismos límites que `GET /search`) | hasta `top_k` pares `{name, score}` ordenados por similitud coseno aproximada descendente |

- `GET /health` **no** se expone como tool MCP — sigue siendo un endpoint HTTP
  plano para checks de infraestructura/orquestación, no es algo que el
  chatbot necesite invocar como parte de una conversación.
- La tool no toca Postgres ni dispara ningún re-sync del índice — mismo
  comportamiento que `GET /search`: el índice se sincroniza una sola vez al
  arrancar el proceso (`IndexSyncService`, ya implementado y fuera de alcance
  de esta sesión), y tanto la ruta HTTP como la tool MCP solo leen la matriz
  de embeddings/grafo HNSW ya en memoria.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| `PerfumeSimilarityIndex.search()` lanza `RuntimeError` (p. ej. índice no inicializado) | mismo caso que hoy produce `HTTPException(503)` en `GET /search`: la tool MCP devuelve un resultado de error explícito, no tumba la conexión MCP ni el proceso |
| `query` vacío o `top_k` fuera de rango | resultado de tool de error de validación — mismos límites que ya validan los `Query(...)` de `GET /search` (`top_k` entre 1 y 50) |
| Cliente MCP (chatbot) se desconecta a mitad de una búsqueda | no afecta al proceso FastAPI ni a la ruta HTTP `/search`, que sigue sirviendo en paralelo |

## Configuración

- Sin variables de entorno nuevas: reusa `server_config.py` (`load_server_config`)
  tal cual — mismo host/puerto que ya configura `GET /search`, sin un puerto
  separado para MCP.
- La ruta donde se monta el sub-app MCP (p. ej. `/mcp`) es configurable con un
  default razonable, mismo criterio que la ruta de montaje en
  `backend-mcp-server.md`.

## Fuera de alcance

- **Todo lo ya fuera de alcance en `perfume-similarity-search.md`** sigue
  vigente tal cual (reconstruir el índice sin reiniciar el proceso, migrar el
  storage a `pgvector`, reentrenar el modelo, etc.) — esta sesión no reabre
  nada de eso, solo agrega un transporte MCP sobre la misma capacidad.
- **Tools de escritura o de administración del índice vía MCP** (forzar un
  resync, invalidar el índice) — no existen hoy ni siquiera como endpoint
  HTTP; no se agregan acá.
- **Exponer `/health` como tool** — se mantiene exclusivamente como endpoint
  HTTP de infraestructura.
- **Autenticación/autorización del endpoint MCP** — mismo criterio que
  `perfume-similarity-search.md`: público si el proceso es alcanzable en red,
  igual que `/search` y `/health` hoy.
- **Tests** — se escriben en una sesión de testing separada sobre este mismo
  worktree, por la convención raíz del proyecto.
