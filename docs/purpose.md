# Propósito del proyecto



## Qué es (y qué no es)

Mario da Parfums es un **proyecto de aprendizaje y experimentación técnica**. Toma una idea de producto concreta, un comparador de precios de perfumes para Chile, y la lleva hasta un sistema funcional, reproducible y documentado, usándola como excusa para practicar tecnologías y formas de trabajo.

**No es** un producto en operación, ni un comparador con datos reales de tiendas, ni una propuesta de innovación algorítmica. Los precios y tiendas son simulados ([`requirements.md`](requirements.md)); la búsqueda semántica usa un modelo de embeddings público, preentrenado y pequeño, con un índice HNSW de una librería estándar (`hnswlib`); el chatbot es un bucle de tool calling sobre un LLM de terceros (Gemini). Ninguna de esas piezas es una contribución original: el valor está en cómo se integran.

## Qué se quiso practicar

| Área | Dónde se ve |
|---|---|
| Backend con NestJS, Drizzle ORM y Postgres (migraciones, índices GIN/pg_trgm, paginación por cursor, validación, rate limiting) | [`backend/`](../backend) |
| Frontend con Next.js 16 / React 19 / Tailwind v4, consumo de tres servicios independientes (REST, servicio de similitud, WebSocket) | [`frontend/`](../frontend) |
| Integración de servicios en distintos lenguajes (TypeScript y Python) sobre una misma base de datos | ver [`architecture.md`](architecture.md) |
| Embeddings y búsqueda semántica: `sentence-transformers`, índice HNSW (`hnswlib`), persistencia en disco | [`similarityServer/similarity.py`](../similarityServer/similarity.py) |
| LLM con tool calling y guardrails de dos etapas; protocolo MCP como capa de acceso a datos | [`chatbot/`](../chatbot), [`backend/src/mcp/`](../backend/src/mcp) |
| Docker / infraestructura reproducible | [`docker-compose.yml`](../docker-compose.yml) raíz, Dockerfiles multi-stage por servicio, perfiles `seed`/`tools`; ver [`local-setup.md`](local-setup.md) |
| Trabajo con agentes de código: `CLAUDE.md` por paquete, skills (`testing`, `security-audit`, etc.), worktrees por feature, specs previas por feature, sesiones separadas de implementación y testing, mutation testing | [`CLAUDE.md`](../CLAUDE.md), [`specs/`](../specs) |

## Dónde está el valor

- Recorrer el camino completo **idea → especificación → implementación → pruebas → documentación**, con specs por feature (`specs/<feature>.md`) que son la fuente de verdad de cada comportamiento.
- Tomar decisiones explícitas y **dejarlas escritas con su razón** (por ejemplo, simular el scraping, no usar pgvector, elegir HNSW), ver [`design-decisions.md`](design-decisions.md).
- Ser honesto sobre los límites del resultado: ver [`limitations.md`](limitations.md).
