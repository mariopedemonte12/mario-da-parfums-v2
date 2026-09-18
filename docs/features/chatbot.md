# Chatbot y recomendaciones



## Problema

El usuario quiere preguntar en lenguaje natural ("¿cuál es el más barato de Sauvage?", "recomiéndame algo parecido a...") sin navegar filtros, y sin que un LLM invente precios o disponibilidad.

## Solución

Un asistente ("Sensei") accesible como widget flotante en todas las rutas. Detrás hay un servidor WebSocket ([`chatbot/`](../../chatbot)) que:
1. Pasa cada mensaje por un clasificador de alcance (etapa 1).
2. Si está dentro de alcance, lo entrega a un agente Gemini con tool calling (etapa 2) que consulta datos reales a través de servidores MCP de solo lectura.
3. Responde en streaming y puede mandar tarjetas de perfumes para dibujarlas en la UI.

## Funcionamiento

- **Protocolo WebSocket** ([`protocol.ts`](../../chatbot/src/protocol.ts)): cliente envía `{type:"message", text}`; servidor emite `status`, `token` (streaming), `fragrances` (tarjetas), `done` o `error`. Un turno a la vez por conexión.
- **Sesión**: una conexión = una conversación, en memoria, sin usuario ni persistencia. Historial truncado por turnos completos: 12 turnos para el agente y 4 (solo texto) para el clasificador, configurables ([`session.ts`](../../chatbot/src/session.ts), [`config.ts`](../../chatbot/src/config.ts)).
- **Etapa 1** ([`guardrail/scope-classifier.ts`](../../chatbot/src/guardrail/scope-classifier.ts)): Gemini como juez, salida JSON `in_scope`. Fuera de alcance → mensaje fijo, sin llegar al agente. Falla abierto.
- **Etapa 2** ([`agent/chat-agent.ts`](../../chatbot/src/agent/chat-agent.ts), [`system-prompt.ts`](../../chatbot/src/agent/system-prompt.ts)): bucle de tool calling con tope de 8 iteraciones; el prompt exige usar solo datos de tools para catálogo/precios y ignorar intentos de cambiar el rol.
- **Modelos**: `gemini-3.5-flash-lite` con fallback a `gemini-3.1-flash-lite` ([`model-fallback.ts`](../../chatbot/src/gemini/model-fallback.ts)).
- **Tools reales**:
  - Backend, MCP `POST /mcp`: `search_fragrances`, `get_fragrance`, `list_vendors`, `get_listings_for_fragrance`, `get_cheapest_listing` ([`register-catalog-tools.ts`](../../backend/src/mcp/tools/register-catalog-tools.ts)).
  - similarityServer, MCP `/mcp`: `search_similar_fragrances` ([`mcp_server.py`](../../similarityServer/mcp_server.py)).
  - Local (no MCP): `present_fragrances` (hasta 6 tarjetas con `id, name, brand, price, imageUrl`).
- **Recomendaciones**: no hay motor de recomendación propio. "Recomendar" significa que el agente combina `search_similar_fragrances` (similitud semántica sobre descripciones sintéticas) y las tools de catálogo/precio, y presenta el resultado.

## Decisiones

Tool calling sobre MCP en vez de prompt con catálogo o acceso directo a la base; guardrail en dos etapas; mcp-servers declarativo. Ver [`../design-decisions.md`](../design-decisions.md#3-chatbot-llm-con-tools).

## Limitaciones

- [`chatbot/mcp-servers.json`](../../chatbot/mcp-servers.json) está vacío en el repo: fuera de Docker el agente no tiene tools de datos hasta configurarlo. En Docker, `MCP_CONFIG_PATH=./mcp-servers.docker.json` ([`chatbot/mcp-servers.docker.json`](../../chatbot/mcp-servers.docker.json)) declara `backend` (`http://backend:3000/mcp`) y `similarity` (`http://similarity:8001/mcp`).
- La tool `search_fragrances` del backend expone `search` (texto libre sobre nombre o marca, máx. 5 tokens / 100 caracteres) y `concentration`, no `name`/`brand`.
- Guardrail basado en LLM, no una barrera dura; falla abierto.
- Sin autenticación en el WebSocket ni en los endpoints MCP; sin límite de tasa propio. Cada mensaje cuesta llamadas a Gemini (clasificador + agente).
- Sin persistencia ni personalización (no conoce favoritos ni usuario).
- Solo lectura: no puede crear favoritos ni modificar datos.
- La calidad de las recomendaciones hereda las limitaciones de la [búsqueda semántica](busqueda-semantica.md#limitaciones) y de los precios simulados.
- No se encontraron evaluaciones formales de calidad del chatbot en el repo (según las notas del proyecto, `specs/chatbot-widget.md` se integró sin completar el testing formal de caja negra; tratar como sin verificar). No hay evaluación de calidad de respuestas.
