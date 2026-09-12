# perfume-similarity-search — servicio FastAPI de búsqueda semántica

## Estado

**No implementado todavía.** Este spec documenta una decisión de arquitectura
tomada con el usuario durante la sesión que armó `perfumeCatalogImporter`
(ver [`perfume-catalog-import.md`](./perfume-catalog-import.md), sección
"Búsqueda por similitud", que dejó el mecanismo como prototipo local sin
exponer). Queda para una sesión de implementación aparte, con su propio
worktree, siguiendo la convención del repo — no es continuación de la sesión
que escribió este documento.

## Contexto

`perfumeCatalogImporter/similarity.py` ya resuelve la parte de ML (embeddings
con `sentence-transformers`, modelo `paraphrase-multilingual-MiniLM-L12-v2`
corriendo localmente — decisión ya confirmada con el usuario, ver el spec de
import — más ranking por similitud coseno) y está probado a mano contra
descripciones reales del catálogo. Lo que falta es exponerlo como un servicio
que el resto del sistema pueda consultar.

**Decisión explícita del usuario**: el backend NestJS (`backend/`) **no debe
cargar el modelo de embeddings ni ejecutar encoders** — ese trabajo va en un
**servidor FastAPI aparte**, un nuevo paquete Python standalone en la raíz del
monorepo (mismo nivel que `backend/`, `frontend/`, `chatbot/`,
`perfumeCatalogImporter/`). El backend consume este servicio por HTTP como
cualquier otro servicio externo, igual que ya no corre scraping ni tareas de
importación pesadas dentro de sí mismo.

## Qué debe hacer (a definir en detalle cuando se implemente)

- Un servicio FastAPI con al menos:
  - Un endpoint de búsqueda (texto libre → N fragancias candidatas con score
    de similitud), envolviendo `PerfumeSimilarityIndex.search()`.
  - Alguna forma de (re)construir el índice sin reiniciar el proceso, ya que
    el catálogo en `fragrances` cambia con cada corrida de
    `perfumeCatalogImporter` y con el CRUD admin del backend.
  - Un healthcheck.
- **Fuente de datos para construir el índice**: leer directo de la tabla
  `fragrances` en Postgres (`name`, `description`) — mismo patrón que ya usa
  `perfumeCatalogImporter` (acceso directo a la DB, no a través de la API REST
  del backend), no reinventar la lectura pasando por NestJS.
- El código de `perfumeCatalogImporter/similarity.py` es el punto de partida
  natural — decidir en esa sesión si se mueve a este nuevo paquete (ya que
  `perfumeCatalogImporter` deja de necesitarlo si la búsqueda vive acá) o si
  se comparte de alguna otra forma; no duplicarlo sin más.

## Explícitamente fuera de alcance de este documento (a resolver en su propia sesión)

- Cómo exactamente el backend NestJS consume este servicio (¿un módulo nuevo?
  ¿lo cuelga de `fragrances`? ¿autenticación entre servicios?) — no
  diseñado todavía.
- Autenticación/autorización del servicio FastAPI en sí.
- Dónde y cómo se despliega (mismo host que el backend, contenedor aparte,
  etc.) — decisión de infraestructura para más adelante, mismo espíritu que
  `platform-spec.md` §9.
- Reentrenar o cambiar el modelo de embeddings — ya decidido en
  `perfume-catalog-import.md`, no se reabre acá salvo que cambien los
  requisitos.
