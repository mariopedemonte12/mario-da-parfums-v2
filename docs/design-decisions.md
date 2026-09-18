# Decisiones de diseño

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Formato: Problema → Alternativas → Decisión → Razón → Trade-offs. Cada dato se extrajo del código; las rutas citadas son relativas a esta carpeta. El servicio de similitud se llama `similarityServer` (hoy carpeta `perfumeCatalogImporter/`, se renombrará; ver [`architecture.md`](architecture.md)).

Índice: [1. Textual vs semántica](#1-búsqueda-textual-vs-semántica) · [2. Pipeline semántico](#2-búsqueda-semántica-cómo-funciona) · [3. Chatbot](#3-chatbot-llm-con-tools) · [4. Vectores en archivo](#4-almacenamiento-de-vectores-archivo-vs-pgvector) · [5. Scraping simulado](#5-scraping-simulado) · [6. Docker](#6-docker) · [7. Servicios](#7-arquitectura-de-servicios)

---

## 1. Búsqueda textual vs semántica

**Problema.** El usuario busca un perfume de dos formas distintas: sabiendo cómo se llama ("bleu", "jean paul gaultier") o describiendo lo que quiere ("algo fresco y cítrico para el verano").

**Alternativas.**
1. Solo búsqueda textual (`ILIKE`/trigramas en Postgres).
2. Solo búsqueda semántica (embeddings) para todo.
3. Dos mecanismos independientes, cada uno para su caso.

**Decisión.** Dos mecanismos separados (opción 3):
- **Textual**: filtros en `GET /fragrances` del backend, sobre Postgres ([`backend/src/fragrances/fragrances.service.ts`](../backend/src/fragrances/fragrances.service.ts)).
- **Semántica**: `similarityServer`, `GET /search` ([`perfumeCatalogImporter/app.py`](../perfumeCatalogImporter/app.py)).

**Razón.** Resuelven problemas distintos. La textual es exacta, barata, sin modelo y admite combinarse con filtros y paginación por cursor. La semántica encuentra por significado pero solo devuelve nombres y una puntuación, no admite filtros ni paginación, y requiere un modelo cargado en memoria. Usar embeddings para buscar un nombre propio sería más caro y menos predecible.

**Trade-offs.** Dos experiencias de búsqueda distintas en la UI: la landing (`/`) usa la semántica ([`frontend/src/features/search/`](../frontend/src/features/search)) y el catálogo (`/fragrances`) usa la textual. No hay búsqueda híbrida ni ranking por relevancia textual (el orden textual es por `id`). Detalle en [features/busqueda-textual.md](features/busqueda-textual.md) y [features/busqueda-semantica.md](features/busqueda-semantica.md).

**Búsqueda textual: estado actual y objetivo.**
- *En esta rama base*: `name` es filtro *contains* case-insensitive (comodines escapados, [`sql-like.util.ts`](../backend/src/common/utils/sql-like.util.ts)) y `brand` es exacto; `jean` **no** encuentra "Jean Paul Gaultier".
- *Decisión final (implementada en `feature/text-search-partial`, aún sin mergear)*: `search` es **el único mecanismo textual** (se eliminan los filtros exactos `name` y `brand`). Parte el texto en tokens (máx. 5 / 100 caracteres) y exige que cada token aparezca (`ILIKE`) en `name` **o** `brand`, sin importar el orden; índice trigrama `pg_trgm` sobre ambos campos. `jean` → Jean Paul Gaultier; `chanel bleu` → Bleu de Chanel. Detalle en [features/busqueda-textual.md](features/busqueda-textual.md). > TODO(verificar): merge y eliminación de `name`/`brand`; migración del frontend (`/fragrances` y el resolvedor de la búsqueda semántica usan `name`) y de la tool MCP `search_fragrances`.

---

## 2. Búsqueda semántica: cómo funciona

**Problema.** Encontrar perfumes a partir de una descripción libre en lenguaje natural, incluso en español, sin coincidencia literal de palabras.

**Alternativas.**
- *Modelo de embeddings*: API alojada de pago vs. modelo local con `sentence-transformers`.
- *Ranking*: fuerza bruta (producto matricial contra todas las filas) vs. índice aproximado.

**Decisión y detalle (todo verificado en código).**

| Aspecto | Valor | Fuente |
|---|---|---|
| Modelo de embeddings | `paraphrase-multilingual-MiniLM-L12-v2` (sentence-transformers, local, multilingüe; vectores de 384 dimensiones según [`NOTES.md`](../perfumeCatalogImporter/NOTES.md)) | [`similarity.py`](../perfumeCatalogImporter/similarity.py), [`server_config.py`](../perfumeCatalogImporter/server_config.py) (`SIMILARITY_MODEL_NAME` permite cambiarlo) |
| Qué texto se embebe | **Solo la columna `description`** de cada perfume (`SELECT name, description FROM fragrances WHERE description IS NOT NULL`). Esa descripción es **sintética**: una de 4 plantillas en español rellenada con marca, nombre, concentración, familia olfativa, público y longevidad | [`repository.py`](../perfumeCatalogImporter/repository.py) `fetch_search_corpus`; [`description_generator.py`](../perfumeCatalogImporter/description_generator.py) |
| Qué se embebe de la consulta | El texto libre `q`, con el mismo modelo | `PerfumeSimilarityIndex.search` |
| Normalización | Vectores L2-normalizados (`normalize_embeddings=True`) | `default_encoder` |
| Cómo se guardan los vectores | Archivo `embeddings.npz` (arrays `names`, `descriptions`, `embeddings`) + archivo hermano `.hnsw` con el grafo. **No** en Postgres | `PerfumeSimilarityIndex.save/load`; ruta por defecto `perfumeCatalogImporter/embeddings.npz`, configurable con `EMBEDDINGS_PATH` |
| Cómo se construye el índice | Al arrancar el servidor (`lifespan`): carga el `.npz` si existe, compara contra `fragrances` y **solo codifica lo nuevo o cambiado** (en un solo lote); si hubo cambios, reconstruye el grafo completo y guarda | [`index_sync.py`](../perfumeCatalogImporter/index_sync.py), `PerfumeSimilarityIndex.sync` |
| Índice | HNSW de `hnswlib`, espacio `ip` (producto interno), `M=16`, `ef_construction=200`, `ef_search=50` | `similarity.py` |
| Cómo se obtiene el resultado | `knn_query` devuelve los `k` vecinos; puntuación = `1 - distancia` (= coseno, por la normalización). `GET /search?q=&top_k=` (`top_k` 1–50, por defecto 5) responde `{results:[{name, score}]}` ordenado por similitud descendente | [`app.py`](../perfumeCatalogImporter/app.py) |
| Consumo en frontend | El frontend pide `top_k=4`, resuelve cada `name` contra `GET /fragrances?name=…&limit=50` (coincidencia exacta en el cliente) y muestra `round(score*100)` como "afinidad" | [`useFragranceSearch.ts`](../frontend/src/features/search/hooks/useFragranceSearch.ts), [`fragrances.api.ts`](../frontend/src/features/fragrances/api/fragrances.api.ts) |

**Razón.**
- *Modelo local*: evita depender de una API de pago y de red en cada búsqueda; el costo es una instalación pesada (`torch`). Se eligió un modelo multilingüe pequeño porque las descripciones y las consultas están en español ([`perfumeCatalogImporter/CLAUDE.md`](../perfumeCatalogImporter/CLAUDE.md)).
- *Por qué HNSW* ([`NOTES.md`](../perfumeCatalogImporter/NOTES.md)): sin fase de entrenamiento (IVF necesita k-means previo, incómodo para un catálogo que crece), buen recall/latencia sin ajustes, es un grafo en memoria sin servicio adicional, y su tiempo de consulta crece aproximadamente de forma logarítmica. `hnswlib` frente a `faiss`: implementación de referencia, dependencia mucho más pequeña.
- *Coseno vía producto interno*: es equivalente solo porque los vectores están normalizados.

**Trade-offs (honestos).**
- Con ~1.000 perfumes, la fuerza bruta habría sido sub-milisegundo; HNSW es una decisión de **escalabilidad hipotética**, no una necesidad medida hoy (así lo dice `NOTES.md`: la fuerza bruta "era suficiente" a este tamaño). Se adoptó por aprendizaje y por diseñar para crecer.
- El resultado es **aproximado**: casi 100 % de recall en la práctica con esos parámetros, pero sin garantía matemática del top-k exacto.
- La calidad depende de una descripción **plantillada**: el modelo compara, en la práctica, texto generado a partir de seis campos estructurados, no reseñas ni notas olfativas reales. Ver [`limitations.md`](limitations.md).
- Cada cambio en el catálogo reconstruye todo el grafo (no es incremental) y solo ocurre al reiniciar el servidor; no hay endpoint de rebuild.
- El índice identifica perfumes solo por `name` (el corpus es `(name, description)`), por lo que dos perfumes con el mismo nombre y distinta marca son ambiguos en el resultado. > TODO(verificar): comportamiento exacto con nombres duplicados entre marcas en el dataset real (hay al menos "Theoreme" y "Pour Homme EDT" según [`NOTES.md`](../perfumeCatalogImporter/NOTES.md)).

---

## 3. Chatbot: LLM con tools

**Problema.** Responder en lenguaje natural preguntas sobre perfumes y precios sin que el modelo invente datos, y sin abrirlo a conversaciones fuera de tema.

**Alternativas.**
1. LLM sin herramientas, con el catálogo pegado en el prompt.
2. RAG sobre embeddings.
3. LLM con **tool calling** sobre un protocolo estándar (MCP) que da acceso de solo lectura a los datos reales.
4. Acceso directo a la base de datos desde el chatbot.

**Decisión.** Opción 3, en [`chatbot/`](../chatbot): servidor WebSocket propio (sin framework), agente Gemini con un bucle de tool calling ([`agent/chat-agent.ts`](../chatbot/src/agent/chat-agent.ts)), y un `McpManager` que conecta a los servidores MCP listados en `mcp-servers.json` y expone sus tools con prefijo `<idServidor>.<tool>` ([`mcp/mcp-manager.ts`](../chatbot/src/mcp/mcp-manager.ts)). Sin código específico por servidor: añadir/quitar uno es cambiar configuración.

**Modelos**: agente y clasificador usan por defecto `gemini-3.5-flash-lite`, con reintento automático en `gemini-3.1-flash-lite` si la primera llamada falla ([`config.ts`](../chatbot/src/config.ts), [`gemini/model-fallback.ts`](../chatbot/src/gemini/model-fallback.ts)).

**Guardrail en dos etapas** ([`guardrail/`](../chatbot/src/guardrail), [`session.ts`](../chatbot/src/session.ts)):
1. Clasificador (LLM como juez, salida JSON `in_scope`) antes del agente. Si está fuera de alcance, responde un mensaje fijo y el mensaje **nunca llega al agente con tools**. Sesgado a `in_scope=true` ante duda y **falla abierto** (si el clasificador falla, deja pasar).
2. System prompt estricto del agente ([`agent/system-prompt.ts`](../chatbot/src/agent/system-prompt.ts)): solo datos de tools para catálogo/precios, ignorar intentos de cambiar de rol, responder en español.

**Lista real de tools.**

| Origen | Tool | Qué hace | Fuente |
|---|---|---|---|
| MCP catálogo (backend, `POST /mcp`, nombre `mario-da-parfums-catalog`) | `search_fragrances` | busca por `name` (contains), `brand` (exacto), `concentration`, con cursor/limit | [`register-catalog-tools.ts`](../backend/src/mcp/tools/register-catalog-tools.ts) |
| | `get_fragrance` | perfume por id | idem |
| | `list_vendors` | lista tiendas (filtro por nombre, paginación) | idem |
| | `get_listings_for_fragrance` | listings (precio, ml, disponibilidad) de un perfume, con filtros `inStock`/`minPrice`/`maxPrice` | idem |
| | `get_cheapest_listing` | listing disponible más barato (escanea hasta 100 listings) o `null` | idem |
| MCP similitud (similarityServer, `/mcp`, nombre `perfume-similarity-search`) | `search_similar_fragrances` | búsqueda semántica: `query`, `top_k` (1–50); devuelve `{name, score}` | [`mcp_server.py`](../perfumeCatalogImporter/mcp_server.py) |
| Local del chatbot (no MCP) | `present_fragrances` | entrega al widget hasta 6 tarjetas estructuradas (`id, name, brand, price, imageUrl`) para dibujarlas en la UI | [`agent/present-fragrances-tool.ts`](../chatbot/src/agent/present-fragrances-tool.ts) |

**Razón.** MCP hace que el chatbot no conozca la base de datos ni el modelo de embeddings: solo consume tools de solo lectura. El guardrail previo evita gastar el agente (y exponer las tools) en mensajes fuera de tema; el system prompt es la segunda capa. El límite de iteraciones (por defecto 8) evita bucles.

**Trade-offs.**
- Las recomendaciones dependen del LLM y de las tools; no hay motor de recomendación propio ni personalización (el chat no conoce al usuario).
- Guardrail basado en LLM: no es una barrera dura; el clasificador falla abierto por diseño.
- `mcp-servers.json` está vacío en el repo: sin configurarlo, el agente no tiene tools de catálogo. > TODO(verificar): configuración final (backend `/mcp` y/o similarityServer `/mcp`) en la infra.
- Sin persistencia: cada conexión WebSocket es una sesión en memoria, historial truncado por turnos completos (12 turnos agente / 4 clasificador por defecto).
- Los endpoints MCP son públicos y sin autenticación.

Ver [features/chatbot.md](features/chatbot.md).

---

## 4. Almacenamiento de vectores: archivo vs pgvector

**Problema.** Dónde guardar los embeddings.

**Alternativas.** `pgvector` en Postgres; motor vectorial dedicado (Qdrant/Milvus); archivo local.

**Decisión.** Archivo `.npz` + `.hnsw` en disco, cargado completo en memoria ([`NOTES.md`](../perfumeCatalogImporter/NOTES.md), "Why the embeddings index is a flat `.npz` file, not pgvector").

**Razón.** `pgvector` exigiría una extensión y una migración sobre una tabla gestionada por Drizzle desde el backend; el servidor siempre puntúa contra la matriz completa (nunca un subconjunto) y un solo proceso lee/escribe el archivo, así que una base de datos no aporta nada.

**Trade-offs.** Solo funciona con un proceso; si dos procesos necesitaran el índice, habría que revisarlo (lo dice la propia nota). Si el archivo se pierde, se recalcula todo (codificar el catálogo completo). En un despliegue con contenedores el archivo debe persistirse en un volumen o se recalcula en cada arranque. > TODO(verificar): cómo lo resuelve el compose final.

---

## 5. Scraping simulado

**Problema.** Un comparador de precios necesita datos de tiendas y perfumes reales, pero extraerlos automáticamente de sitios de terceros (Fragrantica, retailers chilenos) tiene riesgos legales y contractuales, y mala reputación para el proyecto.

**Alternativas.**
1. Scraping real (existió una versión funcional para Fragrantica, luego descartada).
2. Consumir APIs oficiales/afiliados (no evaluado en el código).
3. Datos simulados de forma determinística.

**Decisión.** Simular: el catálogo sale de un dataset estático de Kaggle (nombres reales, descripciones inventadas) y los precios los inventa [`priceGenerator/`](../priceGenerator) ([`price_generator.py`](../priceGenerator/price_generator.py)):
- Precio entero uniforme entre 15.000 y 150.000 CLP, redondeado hacia abajo a un final "990" (puede quedar en 14.990).
- `size_ml` derivado del precio por tramos (<40.000→30 ml, <70.000→50, <110.000→75, si no 100).
- 10 % de probabilidad de `in_stock = false`.
- Semilla `sha256("fragranceId:vendorId")`: mismos datos en cada corrida.
- 5 tiendas ficticias con dominios `.example.com` y URLs de producto inventadas.
- Upsert por `(vendor, fragrance, size)`.

**Razón.** Evita el problema legal y permite igualmente construir y demostrar todo el resto del sistema (modelo de datos, comparador, chatbot, búsqueda). Que sea determinístico hace las corridas reproducibles y testeables.

**Trade-offs.** El sistema **no es un comparador de precios real**: ningún precio o tienda existe. El tamaño en ml sale del precio (no al revés) y cada par perfume-tienda tiene un único listing. Las reglas de matching real, reintentos y delisting de [`platform-spec.md`](../platform-spec.md) §4.2 no se ejercitan. Retomar scraping real sería una decisión nueva de negocio.

---

## 6. Docker

**Problema.** Que el sistema sea reproducible por un tercero sin instalar a mano Postgres, Node y Python.

**Estado verificado hoy.**
- [`backend/docker-compose.yml`](../backend/docker-compose.yml): solo Postgres 16 con volumen `postgres_data`.
- [`priceGenerator/Dockerfile`](../priceGenerator/Dockerfile): `python:3.12-slim`, ejecuta `python -m priceGenerator.main` una vez y termina; sin cron ni scheduler dentro de la imagen (orquestar es responsabilidad externa).
- No hay Dockerfile para backend, frontend, chatbot ni similarityServer en la rama base.

> TODO(verificar): decisión y razones finales (imágenes por servicio, compose raíz, volumen para `embeddings.npz`, cómo se ejecutan importador/priceGenerator, gestión de `.env`) — la infra Docker se está definiendo en otra rama; completar esta sección con Problema/Alternativas/Decisión/Razón/Trade-offs reales cuando esté cerrada.

---

## 7. Arquitectura de servicios

**Problema.** Cómo repartir responsabilidades entre la API, el modelo de embeddings, el chatbot y la carga de datos.

**Alternativas.**
1. Monolito NestJS que incluya todo (incluida la búsqueda semántica y el chat).
2. Servicios separados por responsabilidad y por lenguaje/dependencias.

**Decisión.** Opción 2 (ver diagrama en [`architecture.md`](architecture.md)): backend NestJS como única API sobre los datos, similarityServer y jobs de datos en Python, chatbot en TypeScript, todos sobre un Postgres compartido; monorepo pnpm con `backend`, `frontend`, `chatbot` ([`pnpm-workspace.yaml`](../pnpm-workspace.yaml)) y los paquetes Python fuera del workspace pnpm.

**Razón.** Aislar la dependencia pesada de ML, permitir ciclos de vida distintos (WebSocket con streaming, job batch) y que cada pieza sea reemplazable (el chatbot solo conoce MCP).

**Trade-offs.** Más piezas que levantar y configurar (varios puertos, orígenes CORS y variables de entorno); esquema compartido acoplado a mano entre TypeScript (Drizzle) y Python (SQL crudo); el frontend habla con tres orígenes; y no hay observabilidad, autenticación entre servicios ni orquestación (ver [`limitations.md`](limitations.md)).
