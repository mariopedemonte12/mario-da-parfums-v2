# perfume-similarity-search — servicio FastAPI de búsqueda semántica

## Estado

**Implementado** en el worktree `worktree-perfume-similarity-search`
(`.claude/worktrees/perfume-similarity-search`). Esta sesión reabrió y
cambió dos decisiones que una sesión anterior había dejado escritas más
abajo — ver "Decisiones que cambiaron respecto a la versión anterior de
este documento" — el resto del documento ya refleja lo implementado, no lo
originalmente propuesto.

## Contexto

`perfumeCatalogImporter/similarity.py` ya resolvía la parte de ML (embeddings
con `sentence-transformers`, modelo `paraphrase-multilingual-MiniLM-L12-v2`
corriendo localmente — decisión confirmada con el usuario, ver
[`perfume-catalog-import.md`](./perfume-catalog-import.md) — más ranking por
similitud coseno). Esta sesión lo expuso como servicio y le agregó
sincronización incremental contra la DB (`PerfumeSimilarityIndex.sync()`).

**El backend NestJS (`backend/`) no carga el modelo de embeddings ni ejecuta
encoders** — eso corre en el proceso FastAPI descripto acá. El backend
consumiría este servicio por HTTP (ver "Fuera de alcance" — el consumo desde
el backend no se implementó en esta sesión).

## Decisiones que cambiaron respecto a la versión anterior de este documento

- **Ubicación**: la versión anterior de este documento proponía un paquete
  Python nuevo en la raíz del monorepo, para que `perfumeCatalogImporter`
  nunca cargara `sentence-transformers`. Decisión revisada con el usuario:
  **el servicio vive dentro de `perfumeCatalogImporter/`** (`app.py`,
  `index_sync.py`, `server_config.py`), como un segundo entrypoint del mismo
  paquete junto al importador CLI (`main.py`). Motivo: `perfumeCatalogImporter`
  ya depende de `sentence-transformers`/`torch` desde antes (para
  `similarity.py`) y ya es el único lugar del proyecto con esa dependencia
  pesada — separar en dos paquetes solo para aislar el modelo del backend
  NestJS no sumaba nada, porque el backend NestJS de todos modos nunca iba a
  importar ninguno de los dos paquetes Python. `similarity.py` no se mueve ni
  se duplica: ambos entrypoints (`main.py` y `app.py`) lo comparten tal cual.
- **Reconstruir el índice sin reiniciar el proceso**: la versión anterior lo
  pedía como requisito. Se recortó explícitamente el alcance a **sincronizar
  el índice una sola vez, al arrancar el proceso** (`IndexSyncService`,
  ejecutado en el `lifespan` de FastAPI) — sin endpoint de rebuild, sin
  watcher de cambios en la DB. Ver "Fuera de alcance" más abajo.

## Qué hace

- **Dos responsabilidades**, cada una con su propio módulo:
  1. **Mantener el índice de embeddings al día contra `fragrances`**
     (`index_sync.py`, clase `IndexSyncService`): al arrancar el proceso, lee
     `(name, description)` directo de Postgres
     (`FragranceRepository.fetch_search_corpus()` — mismo patrón de acceso
     directo a la DB que ya usa el importador, no pasa por la API REST del
     backend), carga el índice existente en disco si lo hay, y llama
     `PerfumeSimilarityIndex.sync()` para traerlo al día: fragancias nuevas o
     con `description` distinta se re-embeben (un solo llamado batch al
     encoder, no uno por fragancia); fragancias que ya no están en la DB se
     descartan del índice; el resto reusa el embedding que ya tenía. Si algo
     cambió, guarda el índice actualizado en disco. La DB solo se toca en
     este paso — una request de búsqueda nunca golpea Postgres.
  2. **Servir búsqueda semántica** (`app.py`): el encoder
     (`sentence-transformers`) y la matriz de embeddings quedan en memoria
     para toda la vida del proceso — nada se carga ni se lee por request.
     - `GET /search?q=<texto>&top_k=<n>` — envuelve
       `PerfumeSimilarityIndex.search()`, devuelve hasta `top_k` (default 5,
       máximo 50) pares `{name, score}` ordenados por similitud coseno
       **aproximada** descendente (ver ranking por HNSW abajo).
     - `GET /health` — healthcheck simple.
- **Almacenamiento del índice: archivo `.npz` en disco**
  (`perfumeCatalogImporter/embeddings.npz`, gitignoreado), no `pgvector` ni
  ninguna DB vectorial — decisión explícita del usuario: la matriz completa
  se necesita siempre entera en memoria para rankear (nunca un subconjunto
  vía query), un solo proceso la lee/escribe, y `pgvector` sumaría una
  extensión + migración a una tabla que ya gestiona Drizzle desde `backend/`
  sin resolver ningún problema real hoy. Ver
  `perfumeCatalogImporter/NOTES.md` para el detalle y para cuándo esta
  decisión dejaría de tener sentido.
- **Ranking por HNSW, no por fuerza bruta** — decisión explícita del usuario
  para que la búsqueda sea *production-ready contra un dataset masivo*:
  `PerfumeSimilarityIndex.search()` usa un grafo HNSW (`hnswlib`,
  `space="ip"`, válido porque los embeddings están normalizados) en vez del
  escaneo lineal `embeddings @ query_embedding` de la versión anterior de
  esta sesión — tiempo de query sub-lineal en vez de O(N·d), a cambio de que
  el resultado es aproximado (no garantiza el top-k exacto, aunque el recall
  es prácticamente 100% con los parámetros usados a los volúmenes de este
  proyecto). El grafo se persiste junto al `.npz` (`embeddings.hnsw`) y solo
  se reconstruye cuando `sync()` detecta un cambio real contra la DB — un
  arranque sin cambios reusa el grafo tal cual. Detalle completo (por qué
  HNSW y no IVF/PQ, por qué `hnswlib` y no `faiss`, qué falta para que sea
  incremental en vez de reconstrucción completa) en
  `perfumeCatalogImporter/NOTES.md`.

## Fuera de alcance

- **Reconstruir el índice sin reiniciar el proceso** — recortado de esta
  sesión (ver arriba). Hoy, un cambio en `fragrances` (nueva corrida de
  `perfumeCatalogImporter`, o un cambio desde el CRUD admin del backend) no
  se refleja en la búsqueda hasta el próximo restart del servidor FastAPI.
- Cómo exactamente el backend NestJS consume este servicio (¿un módulo
  nuevo? ¿lo cuelga de `fragrances`? ¿autenticación entre servicios?) — no
  diseñado ni implementado.
- Autenticación/autorización del servicio FastAPI en sí — hoy `/search` y
  `/health` son públicos si el proceso es alcanzable en red.
- Dónde y cómo se despliega (mismo host que el backend, contenedor aparte,
  etc.) — decisión de infraestructura para más adelante, mismo espíritu que
  `platform-spec.md` §9.
- Reentrenar o cambiar el modelo de embeddings — ya decidido en
  `perfume-catalog-import.md`, no se reabre acá.
- Migrar el almacenamiento del índice a `pgvector`/un vector DB — ver
  "Almacenamiento del índice" arriba; no descartado para siempre, solo no
  justificado con el volumen y la arquitectura actuales.
