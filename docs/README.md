# Documentación de Mario da Parfums

Índice de la documentación del proyecto (comparador de perfumes para Chile, con datos simulados; proyecto de aprendizaje). Los enlaces son relativos a esta carpeta.

## Para entender el proyecto

| Documento | Contenido |
|---|---|
| [`purpose.md`](purpose.md) | Qué es (y qué no es) el proyecto y qué se quiso practicar. |
| [`requirements.md`](requirements.md) | Qué está implementado, alcance, fuera de alcance y divergencias con [`platform-spec.md`](../platform-spec.md). Incluye el aviso de que precios y tiendas son simulados. |
| [`architecture.md`](architecture.md) | Diagrama, servicios, puertos, por qué están separados y cómo se compone en Docker. |
| [`design-decisions.md`](design-decisions.md) | Decisiones (problema, alternativas, decisión, razón, trade-offs): búsqueda textual vs semántica, pipeline de embeddings, chatbot, vectores en archivo vs pgvector, datos simulados, Docker, servicios. |
| [`limitations.md`](limitations.md) | Limitaciones conocidas y verificadas. |

## Funcionalidades

| Documento | Contenido |
|---|---|
| [`features/comparador-precios.md`](features/comparador-precios.md) | Comparación de precios por perfume. |
| [`features/busqueda-textual.md`](features/busqueda-textual.md) | Parámetro `search` de `GET /fragrances`. |
| [`features/busqueda-semantica.md`](features/busqueda-semantica.md) | Búsqueda por descripción libre con embeddings y HNSW. |
| [`features/chatbot.md`](features/chatbot.md) | Chatbot con tool calling y servidores MCP. |
| [`features/catalogo-y-detalle.md`](features/catalogo-y-detalle.md) | Catálogo, filtros y página de detalle. |
| [`features/cuentas-y-favoritos.md`](features/cuentas-y-favoritos.md) | Cuentas, sesión, roles, favoritos y perfil. |
| [`features/administracion-y-datos.md`](features/administracion-y-datos.md) | CRUD administrativo y generación de datos simulados. |

## Operación

| Documento | Contenido |
|---|---|
| [`local-setup.md`](local-setup.md) | Puesta en marcha con Docker Compose, dataset, seed, usuario admin, tests y troubleshooting. |
| [`production.md`](production.md) | Qué está implementado para operar el sistema y qué solo se recomienda (separados explícitamente). |

## Proceso de desarrollo

| Documento | Contenido |
|---|---|
| [`agentic-development.md`](agentic-development.md) | Cómo se trabajó con agentes de código: `CLAUDE.md`, skills, specs, worktrees, sesiones separadas. Contiene secciones `TODO(autor)` pendientes. |

## Otros documentos del repositorio

- [`../specs/`](../specs): un spec por feature (fuente de verdad de cada comportamiento).
- [`../platform-spec.md`](../platform-spec.md): intención original de producto; algunas secciones están desactualizadas (ver el aviso al inicio).
- [`../backend/docs/`](../backend/docs): decisiones transversales del backend (manejo de errores, códigos de validación).
- `NOTES.md` dentro de cada módulo: decisiones no obvias de ese módulo.
- [`../docker-compose.yml`](../docker-compose.yml) y [`../.env.example`](../.env.example): infraestructura y variables.

## Convenciones de estos documentos

- Lo no verificable desde el repositorio se marca `TODO(verificar)`; lo que solo el autor puede escribir, `TODO(autor)`.
