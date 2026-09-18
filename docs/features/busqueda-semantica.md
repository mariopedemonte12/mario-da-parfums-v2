# Búsqueda semántica

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Servicio documentado como `similarityServer` (hoy carpeta [`perfumeCatalogImporter/`](../../perfumeCatalogImporter), se renombrará). > TODO(verificar): rutas tras el rename.

## Problema

El usuario describe lo que quiere ("un perfume fresco, cítrico, para el verano") y no sabe el nombre. Una búsqueda por texto literal no sirve.

## Solución

Un servicio aparte convierte las descripciones de todos los perfumes en vectores (embeddings) y, dado un texto libre, devuelve los perfumes cuyas descripciones son más cercanas en significado. La landing (`/`) lo usa como buscador principal y muestra un resultado protagonista más hasta tres secundarios con un porcentaje de "afinidad".

## Funcionamiento

1. **Datos de entrada**: descripciones sintéticas generadas por plantilla a partir de marca, nombre, concentración, familia olfativa, público y longevidad ([`description_generator.py`](../../perfumeCatalogImporter/description_generator.py)). El importador las guarda en `fragrances.description`.
2. **Arranque del servicio** ([`app.py`](../../perfumeCatalogImporter/app.py), [`index_sync.py`](../../perfumeCatalogImporter/index_sync.py)): carga el modelo `paraphrase-multilingual-MiniLM-L12-v2`, lee `(name, description)` de Postgres, carga `embeddings.npz` si existe, codifica solo lo nuevo o cambiado, reconstruye el grafo HNSW si hubo cambios y guarda. Luego cierra la conexión a la base: **las búsquedas no tocan Postgres**.
3. **Consulta** `GET /search?q=<texto>&top_k=<1..50>` (por defecto 5): codifica `q`, busca los vecinos en el grafo HNSW (`M=16`, `ef_construction=200`, `ef_search=50`, espacio producto interno sobre vectores normalizados) y responde `{results: [{name, score}]}`. `503` si el índice no está construido.
4. **Frontend** ([`useFragranceSearch.ts`](../../frontend/src/features/search/hooks/useFragranceSearch.ts)): pide `top_k=4`, resuelve cada nombre contra `GET /fragrances?name=&limit=50` (coincidencia exacta en cliente) y muestra `round(score*100)` como afinidad. La búsqueda se lanza al enviar, no mientras se escribe.
5. **Mismo índice, segunda puerta**: el servidor monta un servidor MCP en `/mcp` con la tool `search_similar_fragrances` ([`mcp_server.py`](../../perfumeCatalogImporter/mcp_server.py)), que usa el chatbot para recomendar.

## Decisiones

Modelo local multilingüe, HNSW, vectores en archivo y no en `pgvector`, sincronización incremental al arrancar: razones y trade-offs en [`../design-decisions.md`](../design-decisions.md#2-búsqueda-semántica-cómo-funciona) y [`../design-decisions.md`](../design-decisions.md#4-almacenamiento-de-vectores-archivo-vs-pgvector). El backend NestJS no participa: el frontend llama directamente al servicio.

## Limitaciones

- **Se busca sobre texto plantillado**, no sobre reseñas ni notas olfativas reales: el "significado" que captura el modelo es en gran parte el de seis campos estructurados. Una consulta como "huele a madera y vainilla" no tiene información real de notas con qué compararse.
- El modelo es pequeño y genérico (paráfrasis multilingüe); no está ajustado al dominio de perfumería ni se evaluó su calidad de recuperación con métricas. > TODO(verificar): no se encontró ninguna evaluación de relevancia en el repositorio.
- Aproximado (HNSW): sin garantía de top-k exacto.
- Índice identificado solo por `name`: perfumes con igual nombre y distinta marca son ambiguos, y el frontend resuelve por nombre exacto (toma el primero).
- El índice se sincroniza solo al arrancar; cambios en el catálogo (importador o CRUD admin) no se reflejan hasta reiniciar el servicio. Cada cambio reconstruye el grafo completo.
- Sin filtros (marca, concentración…) ni paginación; `top_k` ≤ 50.
- `/search` y `/mcp` no tienen autenticación ni límite de tasa; CORS permite solo `GET` desde `FRONTEND_URL`.
- Requiere `torch`/`sentence-transformers` (instalación pesada) y cargar el modelo en memoria.
