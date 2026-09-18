# Producción: qué existe y qué se recomienda

**Este proyecto no está desplegado en producción ni se ha operado como tal.** Es un proyecto de aprendizaje con datos simulados ([`purpose.md`](purpose.md), [`requirements.md`](requirements.md)). TLS, reverse proxy, dominio público, orquestación en la nube y CI están declarados **fuera de alcance** en [`specs/docker-infra.md`](../specs/docker-infra.md).

Este documento separa dos cosas para no confundirlas:

- **Implementado**: existe en el repositorio (compose, Dockerfiles, código) y se puede verificar allí.
- **Recomendado / posible configuración**: sugerencias de cómo se podría operar el sistema. **No están implementadas ni probadas en este repo.**

---

## Implementado

Cada punto indica dónde verificarlo.

### Secretos y configuración
- Toda la configuración entra por variables de entorno desde un único archivo `.env` en la raíz, ignorado por git; el repo solo incluye [`.env.example`](../.env.example) ([`docker-compose.yml`](../docker-compose.yml)).
- `JWT_SECRET` es obligatorio: compose falla al interpolar si falta. `GEMINI_API_KEY` vacío hace que solo el chatbot termine con un error explícito.
- El `.env.example` trae valores de desarrollo (por ejemplo `POSTGRES_PASSWORD=mario_da_parfums` y un `JWT_SECRET` de ejemplo) que **no son seguros como están**: hay que cambiarlos antes de exponer nada.

### Postgres y persistencia
- Postgres 16 con el volumen con nombre `postgres_data`; el índice semántico (`embeddings.npz` y `.hnsw`) en el volumen `similarity_data`. Ambos sobreviven a `docker compose down` (no a `down -v`).
- Postgres se publica solo en `127.0.0.1` (no en todas las interfaces).
- Las migraciones se aplican automáticamente con el servicio one-shot `migrate` en cada `up` (idempotente).

### Health checks y reinicio
- Healthchecks definidos para `postgres` (`pg_isready`), `backend` (`GET /`), `similarity` (`GET /health`, que solo responde tras sincronizar el índice; `start_period` de 300 s), `chatbot` (conexión TCP al puerto WebSocket) y `frontend` (`GET /`).
- `depends_on` con `service_healthy` / `service_completed_successfully` fija el orden de arranque.
- Políticas de reinicio: `unless-stopped` en los servicios de larga vida, `on-failure:3` en el chatbot, `no` en los jobs.

### Seguridad de la aplicación
- Backend con `NODE_ENV=production` en compose: cookie de sesión `Secure` y HSTS. Los navegadores aceptan la cookie `Secure` en `http://localhost`, pero **no en otros hosts sin TLS**; sin HTTPS el login no funcionará desde otra máquina (salvo poner `BACKEND_NODE_ENV=development`, que reduce la seguridad).
- Endurecimiento del backend: helmet, rate limiting (100/min global, 5/min en login y registro), límite de body de 256 kb, cookie `httpOnly` ([`specs/security-hardening.md`](../specs/security-hardening.md), [`limitations.md`](limitations.md)).
- CORS con credenciales restringido a `FRONTEND_URL` (backend y similarity).
- Contenedores de backend, frontend, chatbot, similarity y priceGenerator ejecutados con usuario no root (`USER` en sus Dockerfiles).
- Imágenes multi-stage; versiones de Python fijadas con `constraints.txt`.

### Logs
- Nivel de log configurable en los servicios Python (`SIMILARITY_LOG_LEVEL`, `PRICE_GENERATOR_LOG_LEVEL`). Los logs se consultan con `docker compose logs`.
- No hay agregación centralizada, métricas ni monitoreo ([`limitations.md`](limitations.md)).

### Lo que **no** existe
- TLS ni reverse proxy; dominio.
- Autenticación en `/search` (similarity), en `/mcp` (backend y similarity) ni en el WebSocket del chatbot.
- Backups automáticos, restauración probada, rotación de secretos.
- CI/CD (no hay `.github/`), scheduler de jobs, despliegue cloud/k8s.
- Usuario admin de fábrica (se promueve a mano; ver [`local-setup.md`](local-setup.md)).

> Atención: en compose, backend (3000), similarity (8001) y chatbot (8081) se publican en **todas las interfaces** del host, junto con el frontend. En una máquina expuesta a internet eso deja abiertos `/mcp`, `/search` y el WebSocket sin autenticación.

---

## Recomendado / posible configuración

> **Todo lo de esta sección es una recomendación, no una descripción del repo.** No está implementado ni verificado aquí.

### Secretos
- Generar valores nuevos y fuertes para `JWT_SECRET` y la contraseña de Postgres; no reutilizar los del `.env.example`.
- En un entorno real, inyectar secretos desde un gestor (o los secretos del orquestador) en vez de un archivo `.env` en disco, y rotarlos.

### Reverse proxy y TLS
- Poner un reverse proxy (Caddy, Nginx, Traefik u otro) delante con HTTPS y un dominio, terminando TLS y exponiendo solo el frontend y la API pública.
- No publicar `similarity` (8001) ni el chatbot al exterior sin autenticación; dejarlos accesibles solo por la red interna, o exponerlos por el proxy con controles de acceso. Ojo: hoy el navegador llama directamente a similarity y al chatbot (`NEXT_PUBLIC_QUERY_API_URL`, `NEXT_PUBLIC_CHATBOT_WS_URL`), así que ocultarlos exige enrutarlos por el proxy (y reconstruir el frontend con las nuevas URLs públicas).
- Con dominio y HTTPS, `FRONTEND_URL` y las `NEXT_PUBLIC_*` deben ser esos orígenes públicos exactos.
- Considerar autenticación o límites de tasa también en el WebSocket del chatbot, que consume una clave de Gemini de pago por uso.

### Persistencia y backups
- Programar copias periódicas de Postgres (por ejemplo `pg_dump`) y probar la restauración; guardar las copias fuera del host.
- El volumen `similarity_data` es reconstruible (se recalcula desde `fragrances`), por lo que no es crítico respaldarlo; sí lo es la base.
- Si se quisiera correr más de una réplica de `similarity`, habría que revisar el diseño del índice, que hoy asume un solo proceso ([`design-decisions.md`](design-decisions.md#4-almacenamiento-de-vectores-archivo-vs-pgvector)).

### Health checks y monitoreo
- Reutilizar los healthchecks existentes como sondas de liveness/readiness si se migrara a otro orquestador.
- Añadir monitoreo externo (uptime) y alertas sobre esos endpoints, y métricas de aplicación; hoy no existen.

### Logs
- Enviar los logs de los contenedores a un almacén centralizado y definir retención y rotación del driver de logging de Docker.

### Operación
- Automatizar build y despliegue con CI/CD (tests, lint y construcción de imágenes) y versionar las imágenes.
- Si los datos se volvieran reales, programar los jobs de carga con un scheduler externo; hoy son manuales.

> TODO(autor): si alguna vez se despliega el sistema, documentar aquí qué de esta sección se llegó a hacer realmente y con qué resultado.
