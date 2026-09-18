# Arquitectura


> Describe el sistema tal como está en el código y en [`docker-compose.yml`](../docker-compose.yml). Los puertos son los valores por defecto del compose (todos configurables con `*_HOST_PORT` en `.env`; ver [`local-setup.md`](local-setup.md)).
> **Nombres:** el servicio de búsqueda semántica es **`similarityServer`** (carpeta [`similarityServer/`](../similarityServer), antes `perfumeCatalogImporter/`; ver [`specs/docker-infra.md`](../specs/docker-infra.md)). Se ejecuta como `python -m similarityServer.app`. El importador CLI del catálogo vive en el mismo paquete (`python -m similarityServer.main`). En compose el servicio se llama `similarity`.

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
  chatbot/mcp-servers.json (en Docker, `mcp-servers.docker.json`).
```

## Servicios

| Servicio | Tecnología | Puerto por defecto | Responsabilidad |
|---|---|---|---|
| **Frontend** [`frontend/`](../frontend) | Next.js 16, React 19, Tailwind v4 | 3010 (según CORS del backend) | UI. Consumidor puro de tres servicios, sin capa BFF: backend (`NEXT_PUBLIC_BACKEND_API_URL`, [`clients.ts`](../frontend/src/lib/api/clients.ts)), similarityServer (`NEXT_PUBLIC_QUERY_API_URL`) y chatbot (`NEXT_PUBLIC_CHATBOT_WS_URL`, [`ws/clients.ts`](../frontend/src/lib/ws/clients.ts)). |
| **Backend** [`backend/`](../backend) | NestJS, Drizzle ORM | 3000 | API REST única sobre los datos: perfumes, vendors, listings, usuarios/auth, favoritos. **Dueño del esquema de la base de datos** (migraciones en [`backend/drizzle/`](../backend/drizzle)). Además expone un servidor MCP de solo lectura en `POST /mcp` ([`backend/src/mcp/`](../backend/src/mcp)). Swagger en `/docs`. |
| **Postgres** | Postgres 16 (+ extensión `pg_trgm`) | 5432 | Única base de datos. Servicio `postgres` de [`docker-compose.yml`](../docker-compose.yml) (`postgres:16-alpine`, volumen `postgres_data`, publicado solo en `127.0.0.1`). El servicio one-shot `migrate` aplica las migraciones de Drizzle antes de que arranquen backend y similarity. |
| **similarityServer** (servicio `similarity`) | Python, FastAPI, `sentence-transformers`, `hnswlib` | 8001 | Búsqueda semántica: al arrancar sincroniza embeddings contra `fragrances`, mantiene el índice HNSW en memoria (persistido en el volumen `similarity_data`) y sirve `GET /search`, `GET /health` y una tool MCP (`/mcp`). Solo lee Postgres al arrancar; `/health` responde solo tras terminar esa sincronización. |
| **Importador de catálogo** (mismo paquete que similarityServer; servicio `seed-catalog`, perfil `seed`) | Python, `psycopg2` | — (CLI) | Lee el CSV de Kaggle, genera descripciones sintéticas y hace upsert en `fragrances` ([`main.py`](../similarityServer/main.py)). |
| **priceGenerator** [`priceGenerator/`](../priceGenerator) | Python, `psycopg2` | — (CLI batch) | Crea 5 vendors ficticios y hace upsert de un listing simulado por cada par perfume-vendor. Servicio `seed-prices` (perfil `seed`) con su [`Dockerfile`](../priceGenerator/Dockerfile): corre una vez y termina, sin scheduler. |
| **Chatbot** [`chatbot/`](../chatbot) | TypeScript sin framework (`ws`, `@google/genai`, `@modelcontextprotocol/sdk`) | 8081 | Servidor WebSocket: guardrail de alcance (etapa 1), agente Gemini con tool calling (etapa 2) y cliente MCP hacia los servidores declarados en `mcp-servers.json` (en Docker, `mcp-servers.docker.json`). Sin base de datos ni estado persistente. |
| **Servidores MCP** | MCP sobre HTTP streamable | en backend `/mcp`, en similarityServer `/mcp` | Dos servidores de solo lectura: catálogo (backend, 5 tools) y similitud (1 tool). Ver [`design-decisions.md`](design-decisions.md#3-chatbot-llm-con-tools). |

## Por qué están separados

- **similarityServer aparte del backend**: usa `sentence-transformers` (arrastra `torch`), una dependencia pesada de Python que no tiene sentido cargar dentro de un proceso NestJS. El backend nunca importa ni ejecuta el modelo ([`app.py`](../similarityServer/app.py), [`specs/perfume-similarity-search.md`](../specs/perfume-similarity-search.md)). Además mantiene el índice en memoria de un solo proceso.
- **Importador y priceGenerator como scripts batch aparte del backend**: son jobs de carga de datos, no API; escriben directo en Postgres (respetando las mismas restricciones del esquema) en vez de pasar por el pipeline HTTP de mutaciones de un admin. Están en Python porque comparten el ecosistema de datos/ML del importador.
- **Chatbot aparte del backend**: ciclo de vida propio, protocolo distinto (WebSocket con streaming) y credenciales distintas (clave de Gemini). Solo accede a los datos vía MCP, nunca a la base directamente.
- **Postgres compartido, backend dueño del esquema**: los tres escritores (backend, importador, priceGenerator) comparten tablas; los paquetes Python replican a mano los nombres de columna del esquema Drizzle (por ejemplo `perfume_id` en `listings`), por lo que un cambio de esquema exige actualizarlos ([`similarityServer/repository.py`](../similarityServer/repository.py)).
- **Frontend sin BFF**: simplicidad; el costo es que el navegador conoce y llama a tres orígenes distintos (CORS configurado en cada uno).

## Flujos principales

1. **Carga de datos (offline, manual)**: CSV Kaggle → importador → `fragrances`; luego priceGenerator → `vendors` + `listings`. Al (re)iniciar similarityServer se sincronizan los embeddings.
2. **Navegación y comparación**: frontend → `GET /fragrances`, `GET /fragrances/:id`, `GET /listings?fragranceId=`, `GET /vendors`.
3. **Búsqueda semántica**: frontend → similarityServer `GET /search` (devuelve nombres + score) → frontend resuelve cada nombre contra `GET /fragrances?search=` (y filtra por igualdad exacta de nombre en el cliente).
4. **Chat**: frontend ⇄ chatbot (WebSocket) → Gemini → tools MCP (backend / similarityServer) → respuesta en streaming + tarjetas de perfumes.
5. **Cuentas**: frontend → backend `/auths/*`; sesión en cookie `httpOnly` (`sameSite=lax`).

## Composición en Docker

Un único [`docker-compose.yml`](../docker-compose.yml) en la raíz levanta todo (contexto de build = raíz del repo). Orden de arranque por `depends_on`: `postgres` → `migrate` → `backend` y `similarity` → `chatbot` (necesita ambos sanos por sus endpoints MCP); `frontend` espera al backend. Con `--profile seed`, el orden pasa a `migrate` → `seed-catalog` → `similarity` y `seed-catalog` → `seed-prices`, para que el índice se construya con el catálogo ya cargado. Dentro de la red de Docker los servicios se ven por nombre (`postgres`, `backend:3000`, `similarity:8001`); el navegador usa URLs públicas (`NEXT_PUBLIC_*`, horneadas en el build del frontend). Detalle en [`specs/docker-infra.md`](../specs/docker-infra.md) y [`local-setup.md`](local-setup.md).

## Verificaciones

- El backend **no** llama al similarityServer (se verificó por búsqueda en `backend/src`). El único consumidor HTTP directo es el frontend, y el chatbot vía MCP.
- En Docker, el chatbot lee [`chatbot/mcp-servers.docker.json`](../chatbot/mcp-servers.docker.json) (`MCP_CONFIG_PATH`), que apunta a `http://backend:3000/mcp` y `http://similarity:8001/mcp`. El [`chatbot/mcp-servers.json`](../chatbot/mcp-servers.json) por defecto sigue vacío (`[]`): fuera de Docker el chatbot no tiene tools hasta configurarlo.
- Sin capa de autenticación en similarityServer ni en el WebSocket del chatbot (ver [`limitations.md`](limitations.md)).
