# Arquitectura

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Describe el sistema tal como está en el código. Puertos y nombres son los valores por defecto del código; la infra Docker/compose final puede cambiarlos.
> **Nota de rename:** el servicio de búsqueda semántica se documenta aquí como **`similarityServer`**. Hoy vive en la carpeta [`perfumeCatalogImporter/`](../perfumeCatalogImporter) (que además contiene el importador CLI del catálogo); se renombrará a `similarityServer/`. > TODO(verificar): rutas y nombres de módulo Python (`perfumeCatalogImporter.app:app`) tras el rename, y si el importador queda en otra carpeta.

## Diagrama

```
                          ┌──────────────────────────────┐
                          │   Navegador (usuario)        │
                          └──────┬──────────┬─────────┬──┘
                       HTTP+cookie│   HTTP   │   WebSocket
                                  ▼          ▼         ▼
                      ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
                      │   FRONTEND     │ │ similarityServer│ │    CHATBOT     │
                      │ Next.js :3010* │ │ FastAPI :8001  │ │ Node/ws :8081  │
                      │ (consume los 3)│ │ GET /search    │ │ Gemini + tools │
                      └───────┬────────┘ │ /mcp (MCP)     │ └───┬───────┬────┘
                              │ REST     │ índice en RAM  │     │ MCP   │ MCP
                              ▼          │ (HNSW) + disco │     │(HTTP) │(HTTP)
                      ┌────────────────┐ └───────▲────────┘     │       │
                      │    BACKEND     │◄────────┼──────────────┘       │
                      │ NestJS :3000   │  POST /mcp (5 tools)           │
                      │ REST + /mcp    │         │                      │
                      └───────┬────────┘         └──────────────────────┘
                              │ Drizzle                     (lee al arrancar)
                              ▼                                  │
                      ┌────────────────────────────────────────┐ │
                      │            POSTGRES 16                 │◄┘
                      │ fragrances · vendors · listings ·      │
                      │ users · favorites                      │
                      └───────▲──────────────────▲─────────────┘
                              │ psycopg2         │ psycopg2
                  ┌───────────┴────────┐  ┌──────┴─────────────┐
                  │ importador de      │  │   priceGenerator   │
                  │ catálogo (CLI,     │  │ (CLI batch, datos  │
                  │ CSV de Kaggle)     │  │ simulados)         │
                  └────────────────────┘  └────────────────────┘

  * puerto del frontend: valor por defecto de CORS en backend/src/main.ts.
  Las flechas del chatbot hacia backend y similarityServer dependen de
  chatbot/mcp-servers.json (ver TODO más abajo).
```

## Servicios

| Servicio | Tecnología | Puerto por defecto | Responsabilidad |
|---|---|---|---|
| **Frontend** [`frontend/`](../frontend) | Next.js 16, React 19, Tailwind v4 | 3010 (según CORS del backend) | UI. Consumidor puro de tres servicios, sin capa BFF: backend (`NEXT_PUBLIC_BACKEND_API_URL`, [`clients.ts`](../frontend/src/lib/api/clients.ts)), similarityServer (`NEXT_PUBLIC_QUERY_API_URL`) y chatbot (`NEXT_PUBLIC_CHATBOT_WS_URL`, [`ws/clients.ts`](../frontend/src/lib/ws/clients.ts)). |
| **Backend** [`backend/`](../backend) | NestJS, Drizzle ORM | 3000 | API REST única sobre los datos: perfumes, vendors, listings, usuarios/auth, favoritos. **Dueño del esquema de la base de datos** (migraciones en [`backend/drizzle/`](../backend/drizzle)). Además expone un servidor MCP de solo lectura en `POST /mcp` ([`backend/src/mcp/`](../backend/src/mcp)). Swagger en `/docs`. |
| **Postgres** | Postgres 16 (+ extensión `pg_trgm`) | 5432 | Única base de datos. Hoy solo se levanta con [`backend/docker-compose.yml`](../backend/docker-compose.yml). |
| **similarityServer** (hoy `perfumeCatalogImporter/`) | Python, FastAPI, `sentence-transformers`, `hnswlib` | 8001 | Búsqueda semántica: al arrancar sincroniza embeddings contra `fragrances`, mantiene el índice HNSW en memoria y sirve `GET /search` y una tool MCP (`/mcp`). Solo lee Postgres al arrancar. |
| **Importador de catálogo** (mismo paquete que similarityServer hoy) | Python, `psycopg2` | — (CLI) | Lee el CSV de Kaggle, genera descripciones sintéticas y hace upsert en `fragrances` ([`main.py`](../perfumeCatalogImporter/main.py)). |
| **priceGenerator** [`priceGenerator/`](../priceGenerator) | Python, `psycopg2` | — (CLI batch) | Crea 5 vendors ficticios y hace upsert de un listing simulado por cada par perfume-vendor. Empaquetado con [`Dockerfile`](../priceGenerator/Dockerfile) que corre una vez y termina. |
| **Chatbot** [`chatbot/`](../chatbot) | TypeScript sin framework (`ws`, `@google/genai`, `@modelcontextprotocol/sdk`) | 8081 | Servidor WebSocket: guardrail de alcance (etapa 1), agente Gemini con tool calling (etapa 2) y cliente MCP hacia los servidores declarados en `mcp-servers.json`. Sin base de datos ni estado persistente. |
| **Servidores MCP** | MCP sobre HTTP streamable | en backend `/mcp`, en similarityServer `/mcp` | Dos servidores de solo lectura: catálogo (backend, 5 tools) y similitud (1 tool). Ver [`design-decisions.md`](design-decisions.md#3-chatbot-llm-con-tools). |

## Por qué están separados

- **similarityServer aparte del backend**: usa `sentence-transformers` (arrastra `torch`), una dependencia pesada de Python que no tiene sentido cargar dentro de un proceso NestJS. El backend nunca importa ni ejecuta el modelo ([`app.py`](../perfumeCatalogImporter/app.py), [`specs/perfume-similarity-search.md`](../specs/perfume-similarity-search.md)). Además mantiene el índice en memoria de un solo proceso.
- **Importador y priceGenerator como scripts batch aparte del backend**: son jobs de carga de datos, no API; escriben directo en Postgres (respetando las mismas restricciones del esquema) en vez de pasar por el pipeline HTTP de mutaciones de un admin. Están en Python porque comparten el ecosistema de datos/ML del importador.
- **Chatbot aparte del backend**: ciclo de vida propio, protocolo distinto (WebSocket con streaming) y credenciales distintas (clave de Gemini). Solo accede a los datos vía MCP, nunca a la base directamente.
- **Postgres compartido, backend dueño del esquema**: los tres escritores (backend, importador, priceGenerator) comparten tablas; los paquetes Python replican a mano los nombres de columna del esquema Drizzle (por ejemplo `perfume_id` en `listings`), por lo que un cambio de esquema exige actualizarlos ([`perfumeCatalogImporter/repository.py`](../perfumeCatalogImporter/repository.py)).
- **Frontend sin BFF**: simplicidad; el costo es que el navegador conoce y llama a tres orígenes distintos (CORS configurado en cada uno).

## Flujos principales

1. **Carga de datos (offline, manual)**: CSV Kaggle → importador → `fragrances`; luego priceGenerator → `vendors` + `listings`. Al (re)iniciar similarityServer se sincronizan los embeddings.
2. **Navegación y comparación**: frontend → `GET /fragrances`, `GET /fragrances/:id`, `GET /listings?fragranceId=`, `GET /vendors`.
3. **Búsqueda semántica**: frontend → similarityServer `GET /search` (devuelve nombres + score) → frontend resuelve cada nombre contra `GET /fragrances?name=`.
4. **Chat**: frontend ⇄ chatbot (WebSocket) → Gemini → tools MCP (backend / similarityServer) → respuesta en streaming + tarjetas de perfumes.
5. **Cuentas**: frontend → backend `/auths/*`; sesión en cookie `httpOnly` (`sameSite=lax`).

## Verificaciones y pendientes

- El backend **no** llama al similarityServer (se verificó por búsqueda en `backend/src`). El único consumidor HTTP directo es el frontend, y el chatbot vía MCP.
- `chatbot/mcp-servers.json` está **vacío (`[]`) en el repo**; el chatbot solo tiene tools si se configura ahí (o en `MCP_CONFIG_PATH`) al menos el backend (`http://<backend>/mcp`) y/o el similarityServer (`http://<similarity>/mcp`). > TODO(verificar): configuración final de `mcp-servers.json` / compose y URLs internas entre contenedores.
- > TODO(verificar): puertos, nombres de servicio y variables de entorno definitivos del compose (otro agente trabaja en la infra).
- Sin capa de autenticación en similarityServer ni en el WebSocket del chatbot (ver [`limitations.md`](limitations.md)).
