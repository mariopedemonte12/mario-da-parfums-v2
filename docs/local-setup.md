# Puesta en marcha local

Cómo levantar todo el sistema con Docker Compose. La fuente de verdad de lo que hace cada servicio es [`docker-compose.yml`](../docker-compose.yml) y [`specs/docker-infra.md`](../specs/docker-infra.md); este documento es la guía paso a paso.

## Prerrequisitos

- **Docker** con **Docker Compose v2** (el compose usa `depends_on ... required: false`, que exige una versión reciente de Compose).
- **Espacio y tiempo**: la imagen de `similarity` pesa alrededor de 2 GB (torch CPU + modelo de embeddings) y su primer build y arranque son lentos.
- Solo si quieres correr tests o los servicios fuera de Docker: Node.js y pnpm (monorepo pnpm, ver [`package.json`](../package.json)) y Python 3.12 (la versión de las imágenes Python).
- Para descargar el dataset con Kaggle: una cuenta de Kaggle y su API token (`KAGGLE_USERNAME`, `KAGGLE_KEY`). Alternativa: copiar el CSV a mano.
- Opcional: una clave de Gemini (`GEMINI_API_KEY`, <https://aistudio.google.com/apikey>) para el chatbot.

## 1. Clonar y configurar

```bash
git clone <url-del-repo> mario-da-parfums
cd mario-da-parfums
cp .env.example .env
```

Edita el archivo `.env` recién creado (está en `.gitignore`; nunca lo commitees):

| Variable | Qué hacer |
|---|---|
| `JWT_SECRET` | **Obligatorio.** Si falta, `docker compose` falla al interpolar. Genera uno con `openssl rand -hex 32`. |
| `GEMINI_API_KEY` | Opcional. Sin ella, **solo el chatbot** termina al arrancar con un error explícito (compose lo reintenta 3 veces); el resto del sistema funciona. Déjala como `GEMINI_API_KEY=` (vacía y **sin comentario en la misma línea**: Docker Compose leería el comentario como valor y el chatbot arrancaría "sano" con una clave basura). Lo mismo aplica a `KAGGLE_KEY`. |
| `POSTGRES_PASSWORD` | El valor por defecto sirve en local. Si lo cambias, usa caracteres seguros para URL (sin `@ : / ? # %`), porque se incrusta en `DATABASE_URL`. |
| `KAGGLE_USERNAME`, `KAGGLE_KEY` | Solo para el job `download-dataset`. |
| `LOCAL_UID`, `LOCAL_GID` | Solo para `download-dataset` (para que el CSV quede a tu nombre): valores de `id -u` / `id -g`. |
| `*_HOST_PORT`, `FRONTEND_URL`, `NEXT_PUBLIC_*` | Solo si necesitas cambiar puertos u orígenes (ver troubleshooting). |

## 2. Dataset de perfumes

El CSV **no está en el repo** (fuente: dataset de Kaggle "Perfume Dataset", licencia CC BY 4.0; ver [`similarityServer/data/README.md`](../similarityServer/data/README.md)). Es necesario para poblar el catálogo. Dos opciones:

```bash
# A) Descargarlo con el job de compose (requiere KAGGLE_USERNAME y KAGGLE_KEY en el .env)
docker compose --profile tools run --rm download-dataset

# B) Copiarlo a mano
cp /ruta/a/perfumes_dataset.csv similarityServer/data/perfumes_dataset.csv
```

Ambas dejan el archivo en `similarityServer/data/perfumes_dataset.csv`, que el job `seed-catalog` monta en modo solo lectura.

## 3. Levantar el stack

```bash
docker compose --profile seed up -d --build
```

Esto construye las imágenes y arranca, en orden:

1. `postgres` (con `pg_isready` como healthcheck).
2. `migrate`: aplica las migraciones de Drizzle (`backend/drizzle/*.sql`). Es idempotente y corre en cada `up`; no hay paso manual.
3. `seed-catalog`: importa el CSV a la tabla `fragrances` (upsert idempotente).
4. `backend` y `similarity`. `similarity` construye el índice semántico HNSW al arrancar, a partir de `fragrances`, y lo guarda en el volumen `similarity_data`.
5. `seed-prices`: genera 5 tiendas ficticias y un listing simulado por cada par perfume-tienda (determinístico e idempotente).
6. `chatbot` (espera a backend y similarity sanos) y `frontend` (espera al backend).

Sin `--profile seed` se levanta el sistema sin importar catálogo ni precios (catálogo vacío):

```bash
docker compose up -d --build
```

Revisa el estado con `docker compose ps` y los logs con `docker compose logs -f similarity` (u otro servicio). Los jobs `seed-*` terminan con estado `Exited (0)`; es lo esperado.

### Resultado esperado (verificado con el CSV del proyecto)

- `seed-catalog` termina con `Catalog sync finished: created=932 updated=0 discarded=0 failed=71`. Los 71 "fallos" son filas del CSV con un par (marca, nombre) repetido dentro de la misma corrida (aviso `(brand, name) collision within this run`, por ejemplo *Jean Paul Gaultier - Le Classique Eau de Parfum*): se conserva la primera, no es un error de instalación. Al repetir el job verás `created=0 updated=932`.
- `seed-prices` termina con `vendors_ensured=5 listings_created=4660 listings_failed=0`.
- El catálogo no incluye Chanel (0 filas en el CSV): buscar `chanel` devuelve una lista vacía, no un error. Para probar la búsqueda textual usa `jean` o `dior sauvage`.
- Arranque desde volúmenes vacíos con las imágenes ya construidas: todos los servicios `healthy` en ~1 minuto (similarity, que indexa 932 perfumes, en ~20-40 s). El primer build de imágenes (torch + modelo) es aparte y bastante más lento.
- Memoria en reposo (`docker stats`): similarity ~1,1 GiB, backend ~100 MiB, postgres ~65 MiB, frontend ~45 MiB (más el chatbot si tiene clave). En total ~1,5 GiB; el build de la imagen de similarity necesita bastante más, así que construye los servicios de a uno (`COMPOSE_PARALLEL_LIMIT=1 docker compose build <servicio>`) si tu máquina o WSL tiene poca RAM.
- Si haces `docker compose up -d <servicio>` por partes, ten en cuenta que cada `up` vuelve a ejecutar los jobs de los que ese servicio depende (`migrate`, `seed-catalog`); son idempotentes.

### Si importas catálogo con el sistema ya arriba

El índice semántico se construye **solo al arrancar** `similarity`. Si importaste o cambiaste perfumes con el sistema corriendo, reinicia ese servicio para que los indexe:

```bash
docker compose restart similarity
```

No pierde nada: el índice persiste en el volumen y solo se codifican los perfumes nuevos o cambiados. Excepción: si cambias `SIMILARITY_MODEL_NAME`, debes borrar el volumen `similarity_data` (reindexado completo).

### Regenerar precios

`seed-prices` es un job de perfil `seed`; para repetirlo (por ejemplo tras importar más catálogo):

```bash
docker compose --profile seed run --rm seed-prices
```

## 4. URLs y puertos por defecto

| Qué | URL | Variable para cambiar el puerto |
|---|---|---|
| Frontend | <http://localhost:3010> | `FRONTEND_HOST_PORT` |
| API backend | <http://localhost:3000> (Swagger en `/docs`) | `BACKEND_HOST_PORT` |
| Servidor de similitud | <http://localhost:8001> (`/health`, `/search?q=`; solo loopback) | `SIMILARITY_HOST_PORT` |
| Chatbot (WebSocket) | `ws://localhost:8081` (solo loopback) | `CHATBOT_HOST_PORT` |
| Postgres | `127.0.0.1:5432` (solo loopback) | `POSTGRES_HOST_PORT` |

## 5. Crear un usuario admin

No hay seed de usuario admin (fuera de alcance según [`specs/docker-infra.md`](../specs/docker-infra.md)). Los endpoints de administración requieren rol `admin`. El procedimiento es:

1. Registra un usuario normal desde el frontend (`/register`).
2. Promuévelo directamente en la base (la columna `role` es un enum con valores `user` y `admin`, ver [`user.schema.ts`](../backend/src/database/schema/user.schema.ts)):

```bash
docker compose exec postgres psql -U mario_da_parfums -d mario_da_parfums \
  -c "UPDATE users SET role = 'admin' WHERE email = 'tu@correo.com';"
```

(Ajusta usuario y base si cambiaste `POSTGRES_USER` / `POSTGRES_DB`.) Vuelve a iniciar sesión para que el cambio de rol se aplique.

## 6. Correr los tests

Los tests no corren dentro de los contenedores de runtime; se ejecutan desde el host.

```bash
pnpm install                       # una vez, en la raíz

pnpm --filter backend test         # unitarios del backend (Vitest)
pnpm --filter chatbot test         # unitarios del chatbot

# e2e: necesitan un Postgres real en localhost:5432 con las credenciales por defecto
docker compose up -d postgres migrate
pnpm --filter backend test:e2e
pnpm --filter chatbot test:e2e
```

Python (desde la raíz del repo, porque los paquetes se importan como `similarityServer.*` y `priceGenerator.*`; instala antes el `requirements-dev.txt` de cada paquete en un entorno virtual):

```bash
python -m pytest similarityServer                  # por defecto excluye los tests con el modelo real
python -m pytest similarityServer -m real_model    # instancia el modelo real (lento)
python -m pytest priceGenerator
```

Los tests marcados `integration` requieren un Postgres accesible (ver el `pytest.ini` de cada paquete). El frontend tiene Vitest (`pnpm --filter frontend test`), además de `pnpm --filter frontend lint` y `pnpm --filter frontend typecheck`; el backend y el chatbot también tienen `typecheck` y `test:mutation`.

> TODO(autor): si hay un procedimiento propio de verificación (por ejemplo, el orden en que corres las suites o el mutation testing con `test:mutation`), anótalo aquí; no se puede inferir del repo.

## 7. Troubleshooting

- **El login falla sin ningún mensaje (o las búsquedas fallan en silencio).** `FRONTEND_URL` debe ser **exactamente** el origen que ves en la barra de direcciones (esquema, host y puerto). Se usa como lista de CORS con credenciales en backend y similarity. Si abres el sitio como `http://127.0.0.1:3010` pero `FRONTEND_URL=http://localhost:3010`, el navegador bloquea las peticiones sin mostrar error en la UI. Corrige la variable y ejecuta `docker compose up -d` (recrea backend y similarity).
- **Cambié `NEXT_PUBLIC_*` y no pasa nada.** Esas variables se hornean en el bundle en `next build`. Reconstruye: `docker compose build frontend && docker compose up -d frontend`. Deben ser URLs alcanzables **desde el navegador** (puertos publicados), no nombres internos como `backend:3000`.
- **Puerto ocupado** (`port is already allocated` / `address already in use`). Cambia el `*_HOST_PORT` correspondiente (el más común es `POSTGRES_HOST_PORT=5432` si ya tienes un Postgres local). Si cambias el puerto del frontend o del backend, ajusta también `FRONTEND_URL` y `NEXT_PUBLIC_*` y reconstruye el frontend.
- **`similarity` tarda mucho en quedar `healthy`.** Es normal: `/health` responde solo cuando terminó la sincronización inicial del índice y el healthcheck tiene un `start_period` de 300 s. En el primer arranque codifica todo el catálogo. `chatbot` espera a que esté sano, así que también tarda. Sigue el progreso con `docker compose logs -f similarity`.
- **`docker compose` dice que falta `JWT_SECRET`.** Defínelo en el archivo de entorno.
- **El chatbot se reinicia y luego queda caído.** Falta `GEMINI_API_KEY` (el proceso sale con error explícito `Falta la variable de entorno requerida: GEMINI_API_KEY` y compose reintenta 3 veces). Defínela y ejecuta `docker compose up -d chatbot`. En el navegador, el widget "Sensei" se abre pero muestra "SIN CONEXIÓN" y, al enviar un mensaje, "No se pudo conectar con el sensei"; la consola registra `ERR_CONNECTION_REFUSED` contra el WebSocket. El resto del sitio no se ve afectado.
- **El chatbot arranca "sano" aunque no puse clave.** Probablemente dejaste el comentario de `.env.example` en la línea `GEMINI_API_KEY=` (ver la tabla de la sección 1): `docker compose config | grep GEMINI_API_KEY` te muestra el valor real que recibe el contenedor.
- **El catálogo o la búsqueda semántica están vacíos.** Comprueba que el CSV existe en `similarityServer/data/`, que corriste con `--profile seed` y que `seed-catalog` terminó con exit 0 (`docker compose logs seed-catalog`). Si importaste con el sistema arriba, reinicia `similarity`.
- **`download-dataset` falla o el CSV queda con dueño root.** Requiere `KAGGLE_USERNAME` y `KAGGLE_KEY`; corre con tu uid/gid (`LOCAL_UID`, `LOCAL_GID`).
- **Empezar de cero.** `docker compose down -v` borra los volúmenes `postgres_data` y `similarity_data` (pierdes base de datos e índice).
- **Imagen pesada / build lento.** La imagen de `similarity` ronda los 2 GB; las siguientes construcciones reutilizan la caché de capas.
