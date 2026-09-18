# docker-infra — sistema completo en Docker Compose + rename a `similarityServer`

## Contexto

Cierre de portfolio: cualquiera debe poder clonar el repo y levantar todo el
sistema con un solo `docker-compose.yml` en la raíz. En la misma feature se
renombra `perfumeCatalogImporter/` a `similarityServer/` (el paquete es
principalmente el servidor de búsqueda por similitud; el importador CLI del
catálogo sigue viviendo ahí).

## Rename

- `perfumeCatalogImporter/` -> `similarityServer/` (`git mv`, historial
  preservado). Todas las referencias (imports `similarityServer.*`, docs,
  specs, `.gitignore`, comentarios) usan el nombre nuevo.
- Única mención al nombre viejo que se conserva: la nota histórica de
  `specs/perfume-catalog-import.md` (cadena de renombres del paquete).
- Variables de entorno del paquete con prefijo `SIMILARITY_`:

| Antes | Ahora |
|---|---|
| `EMBEDDINGS_PATH` | `SIMILARITY_EMBEDDINGS_PATH` |
| `HOST` | `SIMILARITY_HOST` |
| `PORT` | `SIMILARITY_PORT` |
| `LOG_LEVEL` | `SIMILARITY_LOG_LEVEL` |
| `MCP_MOUNT_PATH` | `SIMILARITY_MCP_MOUNT_PATH` |
| `DATASET_CSV_PATH` | `SIMILARITY_DATASET_CSV_PATH` |
| `SIMILARITY_MODEL_NAME`, `DATABASE_URL`, `FRONTEND_URL` | sin cambio |

## Qué levanta `docker compose up -d --build`

| Servicio | Tipo | Puerto host (default) | Readiness |
|---|---|---|---|
| `postgres` (16-alpine) | long-running, volumen `postgres_data` | 127.0.0.1:5432 | `pg_isready` |
| `migrate` | one-shot (`drizzle-kit migrate`) | - | termina con exit 0 |
| `backend` (NestJS) | long-running | 3000 | `GET /` 200 |
| `similarity` (FastAPI + MCP) | long-running, volumen `similarity_data` (`embeddings.npz`/`.hnsw`) | 8001 (solo `127.0.0.1`) | `GET /health` (solo responde tras el sync inicial del índice) |
| `chatbot` (WS + Gemini) | long-running | 8081 (solo `127.0.0.1`) | conexión TCP al puerto WS |
| `frontend` (Next standalone) | long-running | 3010 | `GET /` < 500 |

Orden (`depends_on` con `service_healthy` / `service_completed_successfully`):
postgres -> migrate -> backend / similarity -> chatbot (necesita backend y
similarity sanos por sus endpoints MCP) ; frontend espera al backend.

Perfiles opcionales:
- `seed`: `seed-catalog` (importa el CSV a `fragrances`) y `seed-prices`
  (`priceGenerator`: vendors falsos + listings). Con `--profile seed` el orden
  es migrate -> seed-catalog -> similarity y seed-catalog -> seed-prices, de modo
  que el índice se construye con el catálogo ya cargado.
- `tools`: `download-dataset` (Kaggle -> `similarityServer/data/`).

## Reglas

- Build context = raíz del repo (pnpm resuelve por `pnpm-lock.yaml` raíz).
  Sin rutas absolutas de la máquina. Multi-stage en backend/frontend/chatbot/
  similarityServer; python con `constraints.txt` (versiones fijadas) y torch CPU.
- URLs: dentro de Docker los servicios se ven por nombre (`postgres`,
  `backend:3000`, `similarity:8001` en `chatbot/mcp-servers.docker.json`). Lo
  que usa el navegador son URLs públicas: `NEXT_PUBLIC_*` se hornean en
  `next build` (build args; cambiar => `docker compose build frontend`);
  `FRONTEND_URL` (CORS backend y similarity) debe ser exactamente el origen de
  la barra de direcciones (si no, el login falla en silencio).
- Secretos solo en `.env` (gitignored). `JWT_SECRET` es obligatorio (compose
  falla al interpolar si falta). `GEMINI_API_KEY` vacío => el chatbot sale con
  error explícito (reintenta 3 veces) y el resto del sistema sigue funcionando.
- El backend corre con `NODE_ENV=production`: cookie de sesión `Secure`
  (aceptada en `http://localhost`) + HSTS.
- Tests de integración/e2e existentes apuntan a `localhost:5432` con las
  credenciales por defecto: `docker compose up -d postgres` los soporta.

## Inicialización

1. `cp .env.example .env` (único archivo de entorno del repo, también para
   desarrollo en el host; ver `specs/single-root-env.md`) y editar `JWT_SECRET`
   (y `GEMINI_API_KEY`).
2. Migraciones: automáticas (`migrate` en cada `up`, idempotente).
3. Dataset: `similarityServer/data/perfumes_dataset.csv` no está en el repo.
   `docker compose --profile tools run --rm download-dataset` (requiere
   `SIMILARITY_KAGGLE_API_TOKEN`) o copiarlo a mano.
4. Seed: `docker compose --profile seed up -d --build`.
5. Índice semántico: lo construye `similarity` al arrancar leyendo `fragrances`
   (encoda solo lo nuevo/cambiado). Si se importó catálogo con el sistema ya
   arriba: `docker compose restart similarity`. Reiniciar no pierde nada: el
   índice persiste en el volumen. Cambiar `SIMILARITY_MODEL_NAME` exige borrar
   el volumen `similarity_data`.
6. No existe seed de usuario admin: los endpoints admin requieren promover un
   usuario a mano en la BD (fuera de alcance).

## Fuera de alcance

TLS/reverse proxy/dominio público, orquestación cloud/k8s, CI, scheduler para
`seed-prices`, seed de usuarios, cambios de lógica de negocio, cambios en la
búsqueda textual del backend, README/docs del repo (otro agente).
