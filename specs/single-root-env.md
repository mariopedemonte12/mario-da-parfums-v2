# Un único archivo de entorno en la raíz (`single-root-env`)

Rama: `chore/single-root-env`. Decisión tomada con el usuario.

## Comportamiento

Existe **un solo** archivo de entorno, `<raíz del repo>/.env` (plantilla versionada: `<raíz>/.env.example`). Sirve a:

1. **Docker Compose** (lo lee desde la raíz para interpolar `docker-compose.yml`).
2. **Desarrollo en el host sin Docker**: backend (NestJS), chatbot, frontend (Next.js) y similarityServer (Python) lo cargan desde la raíz.

Ya no existen `backend/.env.example`, `chatbot/.env.example` ni `similarityServer/.env.example`.

## Precedencia

1. **Entorno real del proceso** (variables exportadas, las que inyecta Compose/orquestador, CI): siempre gana.
2. `<raíz>/.env`: solo rellena las variables que **no** estén ya definidas en el entorno del proceso (nunca sobrescribe).
3. Valores por defecto del código.

No hay fallback a archivos por paquete: `backend/.env`, `chatbot/.env`, `similarityServer/.env` (y equivalentes) **se ignoran**.

## El archivo es opcional

- Si falta, ninguna app falla ni escribe avisos: se usa el entorno del proceso (y los defaults). Las variables obligatorias (`DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY` del chatbot) fallan con sus propios errores existentes, no por la ausencia del archivo.
- Dentro de las imágenes Docker no existe (`.dockerignore` lo excluye). Las variables reales vienen del entorno del contenedor, definido por Compose.
- Un directorio con ese nombre, o un archivo ilegible, cuenta como "no hay archivo".

## Resolución de la ruta

La ruta se calcula desde la **ubicación del módulo**, nunca desde el cwd:

- **backend y chatbot (TS)**: se sube desde el directorio del módulo hasta encontrar `pnpm-workspace.yaml` (marca de la raíz del monorepo; máx. 8 niveles); el archivo es `<esa carpeta>/.env`. Funciona igual desde `src/` (tsx, vitest) y `dist/` (build), y desde cualquier cwd. Si no hay marca (imagen Docker) no se carga nada.
- **similarityServer (Python)**: `Path(__file__).resolve().parent.parent / ".env"`; se comprueba `is_file()`. En la imagen el paquete vive en `/app/similarityServer`, así que apunta a `/app/.env`, que no existe: no se carga nada y no hay `IndexError` (no se usa `parents[n]`).
- **frontend**: `next.config.ts` llama a `loadEnvConfig` de `@next/env` sobre la raíz (`<dir de next.config>/..`), así `next dev`/`next build` ven las `NEXT_PUBLIC_*`. En Docker llegan como build args y la raíz no tiene archivo. Limitación: Next.js siempre lee además sus propios `frontend/.env*` por su cuenta; se documentan como ignorados pero Next no permite desactivarlo, y ante un conflicto ese archivo llega antes que el de la raíz.
- `drizzle.config.ts` y los scripts `db:*` usan el mismo cargador que el backend.

## Variables

Todas viven en `.env.example`, en secciones. Secciones 1-6 = Docker (con default en compose salvo `JWT_SECRET` y `GEMINI_API_KEY`); sección 7 = solo host (Compose la ignora porque arma las suyas y no pasa el archivo a los contenedores).

- Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST_PORT`.
- Backend: `JWT_SECRET`, `JWT_EXPIRES_IN`, `BACKEND_NODE_ENV` (solo Docker), `BACKEND_HOST_PORT`.
- URLs públicas: `FRONTEND_URL`, `FRONTEND_HOST_PORT`, `NEXT_PUBLIC_BACKEND_API_URL`, `NEXT_PUBLIC_QUERY_API_URL`, `NEXT_PUBLIC_CHATBOT_WS_URL`.
- similarityServer: `SIMILARITY_HOST_PORT`, `SIMILARITY_MODEL_NAME`, `SIMILARITY_LOG_LEVEL`.
- Chatbot: `GEMINI_API_KEY`, `GEMINI_AGENT_MODEL`, `GEMINI_AGENT_FALLBACK_MODEL`, `GEMINI_CLASSIFIER_MODEL`, `GEMINI_CLASSIFIER_FALLBACK_MODEL`, `CHATBOT_HOST_PORT`.
- Jobs: `SIMILARITY_KAGGLE_API_TOKEN`, `LOCAL_UID`, `LOCAL_GID`, `PRICE_GENERATOR_LOG_LEVEL`.
- Solo host: `DATABASE_URL` (con `localhost:<POSTGRES_HOST_PORT>`), `PORT`, `CHATBOT_WS_HOST`, `CHATBOT_WS_PORT`, `MCP_CONFIG_PATH`, `SIMILARITY_HOST`, `SIMILARITY_PORT`, `SIMILARITY_MCP_MOUNT_PATH`, `SIMILARITY_EMBEDDINGS_PATH`, `SIMILARITY_DATASET_CSV_PATH`, `CHATBOT_AGENT_HISTORY_TURNS`, `CHATBOT_CLASSIFIER_HISTORY_TURNS`, `CHATBOT_MAX_TOOL_ITERATIONS`, `CHATBOT_REJECTION_MESSAGE`.

Renombrado (decisión posterior del usuario): `KAGGLE_USERNAME` + `KAGGLE_KEY` -> **`SIMILARITY_KAGGLE_API_TOKEN`** (un único token de Kaggle; hay que generar uno nuevo). `download_dataset.py` lo pasa a la librería `kaggle` como `KAGGLE_API_TOKEN` (la variable que lee `kaggle==2.2.4`/`kagglesdk==0.1.37`); Compose lo mapea `KAGGLE_API_TOKEN: ${SIMILARITY_KAGGLE_API_TOKEN:-}`. Sin token (ni `~/.kaggle/access_token`) el script sale con un mensaje explícito.

Reglas del archivo: los comentarios van en su propia línea, nunca tras un valor (Compose leería el comentario como valor). El resultado de `docker compose config` con el ejemplo no cambia respecto de antes salvo el mapeo de Kaggle.

## Edge cases

| Caso | Comportamiento |
|---|---|
| Falta `<raíz>/.env` | Silencio; se usa el entorno del proceso y los defaults. |
| Variable en ambos (entorno y archivo) | Gana el entorno. |
| Variable vacía en el entorno (`X=`) y valor en el archivo | El entorno "definido pero vacío" gana en Node y Python (no se sobrescribe). |
| Ejecución desde otro cwd (`pnpm --filter`, `cd /tmp && node .../dist/main.js`) | Igual: la ruta no depende del cwd. |
| Arranque desde `dist/` | Igual que desde `src/`. |
| Docker | Sin archivo en la imagen; sin error ni aviso; manda el entorno del contenedor. |
| `.env` por paquete antiguo | Ignorado (no se lee, no se avisa). |
| Tests unitarios/e2e | No dependen de que exista el archivo; los e2e del backend fijan sus defaults con `process.env.X ??=`. |

## Verificación de claves (opcional)

`node scripts/check-env.mjs` compara las **claves** de `<raíz>/.env` con las de `.env.example` y avisa de las que faltan o sobran, sin imprimir nunca valores. Las líneas comentadas de la plantilla (opcionales) cuentan como claves opcionales: su ausencia no se reporta.

## Fuera de alcance

- Variables por entorno (`.env.production`, etc.), interpolación `${VAR}` dentro del archivo para Node, gestor de secretos.
- priceGenerator no carga archivo (nunca lo hizo): recibe sus variables por entorno; no cambia.
