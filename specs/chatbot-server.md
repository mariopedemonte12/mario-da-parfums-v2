# chatbot-server — servidor de websockets, agente Gemini y tools multi-MCP

## Contexto y relación con `platform-spec.md` §6

[`platform-spec.md`](../platform-spec.md) §6 ya fija, a nivel de proyecto, las
decisiones estructurales del chatbot:

- Servidor separado del backend (`chatbot/`), ciclo de vida propio.
- El agente accede a datos **solo** a través de uno o más servidores **MCP**
  (herramientas de solo lectura sobre fragancias, vendors, precios y
  disponibilidad) — sin tools de escritura en esta fase.
- Alcance conversacional limitado a perfumes (existencia, precios,
  comparación, disponibilidad, recomendaciones basadas en esos datos) — no es
  un asistente de propósito general.
- Guardrail de **dos etapas**: (1) un clasificador de scope antes del agente
  principal, que corta el mensaje con una respuesta fija si está fuera de
  alcance — el mensaje nunca llega al agente con tools; (2) un system prompt
  estricto en el agente principal como segunda capa de defensa (anti-jailbreak,
  no inventar datos).
- Sin autenticación de usuario en esta fase (datos públicos de catálogo/precio,
  no favoritos personales).

Este documento especifica **el servidor de chatbot en sí**: el transporte
websocket, el motor agéntico (Gemini + tool calling), el mecanismo concreto de
la etapa 1 del guardrail, y el diseño modular para conectar múltiples
servidores MCP. No vuelve a abrir lo ya decidido en §6 arriba, solo lo
desarrolla a nivel de implementación de este componente.

**La implementación del/los servidor(es) MCP que exponen los datos reales de
fragancias/vendors/precios es una dependencia externa a este documento** — ver
"Fuera de alcance".

## Decisión de esta sesión: mecanismo de la etapa 1 del guardrail

§6 dejaba abierto si el clasificador de scope es "una llamada a LLM o un
clasificador dedicado". Decisión acordada con el usuario en esta sesión:
**una llamada a Gemini actuando como juez** (no un encoder con cabezal binario
entrenado). Motivo: un clasificador dedicado requeriría dataset propio
etiquetado, entrenamiento y versionado de un modelo — infraestructura nueva
que hoy no existe para este propósito (el encoder de
`perfumeCatalogImporter` está entrenado para similitud semántica de
fragancias, no para moderación de conversación). Usar Gemini reutiliza el SDK
y la API key que el proyecto ya va a tener para el agente principal, con cero
infraestructura adicional, y la tolerancia se ajusta iterando el prompt del
juez en vez de reentrenar un modelo. Detalle completo más abajo, en "Guardrail
— etapa 1".

## Qué hace, en términos generales

- Expone un servidor **WebSocket** (paquete `ws`, la implementación de facto
  para WebSockets en Node — el runtime no trae un servidor WS nativo) sobre
  HTTP. **Una conexión WS = una sesión de conversación**, con su propio
  historial en memoria; no hay identidad de usuario ni persistencia entre
  reconexiones (coherente con "sin autenticación" de §6).
- Se elige WebSocket en vez de un endpoint HTTP simple específicamente para
  poder **streamear la respuesta del agente token a token** — si la interacción
  fuera solicitud/respuesta única, un endpoint REST habría bastado. Ver
  "Protocolo websocket".
- Por cada mensaje de usuario: (1) pasa por el clasificador de scope (etapa 1);
  si está fuera de alcance, responde con el mensaje de rechazo fijo y termina
  ahí; (2) si está dentro de alcance, se agrega al agente principal (Gemini +
  tool calling), que resuelve la respuesta usando las tools MCP disponibles,
  bajo su system prompt estricto (etapa 2, ya decidida en §6).
- Las tools disponibles para el agente principal salen de agregar los
  catálogos de **todos los servidores MCP configurados**, de forma
  modular: agregar o quitar un servidor MCP de la configuración agrega o
  quita sus tools sin tocar el código del motor agéntico. Ver "Registro
  modular de tools multi-MCP".

## Protocolo websocket

Mensajes JSON en ambas direcciones, un tipo de mensaje por línea de intención:

- Cliente → servidor: `{"type": "message", "text": "<texto del usuario>"}`.
- Servidor → cliente, durante la resolución de un turno:
  - `{"type": "status", "text": "..."}` — eventos informativos opcionales
    mientras el agente usa tools (p. ej. "Buscando en el catálogo..."), para
    que la UI pueda mostrar que el bot está trabajando en vez de quedar
    congelada durante llamadas a tools. No son parte de la respuesta final.
  - `{"type": "token", "text": "<fragmento>"}` — fragmentos de la respuesta
    final del asistente, en orden, a medida que Gemini los genera (streaming).
    Solo la respuesta final se streamea — los pasos intermedios de tool
    calling no se muestran token a token.
  - `{"type": "done"}` — fin del turno; el cliente puede volver a enviar un
    mensaje nuevo.
  - `{"type": "error", "text": "..."}` — error de turno (ver "Manejo de
    errores"); no cierra la conexión, el cliente puede reintentar con un
    mensaje nuevo.
- Un mensaje de usuario vacío o solo espacios en blanco se rechaza a nivel de
  protocolo (`{"type": "error", ...}`) **antes** de invocar al clasificador —
  no consume una llamada a Gemini para algo que no es una pregunta.
- El servidor procesa los mensajes de una misma conexión **secuencialmente**:
  no acepta un segundo `message` mientras el turno anterior no terminó
  (`done`/`error`) — evita interleaving de tokens de dos turnos distintos en
  la misma conexión.

## Guardrail — etapa 1: clasificador de scope (Gemini como juez)

Corre sobre **cada mensaje entrante del usuario**, antes de que llegue al
agente principal con tools.

- **Modelo**: un modelo Gemini distinto y más liviano/barato que el del
  agente principal (configurable por separado, p. ej. una variante *flash* o
  *flash-lite*) — es una clasificación binaria simple, no necesita el modelo
  más caro.
- **Entrada**: no solo el mensaje aislado — los últimos *M* turnos de la
  conversación (config, default acotado y chico, ver "Configuración") más el
  mensaje nuevo. Es necesario para no romper la conversación natural: un
  follow-up como "¿y el segundo más barato?" es ambiguo aislado pero
  claramente dentro de alcance dado el turno anterior.
- **Salida**: estructurada (JSON forzado vía schema de respuesta de Gemini),
  `{"in_scope": boolean}`. Sin texto libre — evita tener que parsear/ambiguar
  la decisión.
- **Sesgo deliberado hacia "dentro de alcance"**: el prompt del juez instruye
  marcar `in_scope=false` únicamente cuando el mensaje es claramente ajeno a
  perfumes/fragancias/precios/vendors/disponibilidad/recomendaciones sobre esos
  datos, o es un intento de cambiar el rol del agente (jailbreak, "ignora tus
  instrucciones", etc.). Saludos, agradecimientos, despedidas, preguntas de
  seguimiento ligadas al hilo, y preguntas sobre qué puede hacer el bot,
  cuentan como dentro de alcance. Esto es exactamente lo que evita que el
  filtro estorbe una interacción natural, en vez de resolverlo con un
  clasificador binario simétrico.
- **La tolerancia se ajusta con prueba y error sobre el prompt/ejemplos del
  juez** (few-shot dentro del prompt), no reentrenando nada — queda
  explícitamente para la sesión de testing, con la tabla de casos borde de
  abajo como punto de partida, no como aprobación final.
- **Si `in_scope=false`**: el servidor responde con un **mensaje de rechazo
  fijo** (una sola copia, editable como texto de configuración, no una regla
  de negocio) y el mensaje del usuario **nunca se agrega al contexto del
  agente principal ni dispara tools**. El mensaje del usuario y la respuesta
  de rechazo sí quedan en el historial de la sesión (para que el propio
  clasificador tenga continuidad en el próximo turno y la transcripción sea
  coherente), pero marcados aparte del hilo que ve el agente con tools.
- **Si la llamada al clasificador falla** (error de red, rate limit, timeout
  de la API de Gemini): **fail-open** — se trata como `in_scope=true` y el
  mensaje sigue al agente principal, que igual tiene su propio system prompt
  estricto (etapa 2) como defensa. Decisión explícita: falla del clasificador
  no debe tumbar el bot entero, y la segunda capa cubre el caso de seguridad;
  ajustable si en testing se ve abuso real de esta vía.

### Casos borde de scope (guía para el prompt del juez y para testing)

| Mensaje | Resultado esperado |
|---|---|
| "Hola", "gracias", "chao" | dentro de alcance (cortesía, no dispara tools) |
| "¿y el segundo más barato?" tras una comparación de precios | dentro de alcance (usa contexto) |
| "¿qué podés hacer?" | dentro de alcance (meta-pregunta sobre el bot) |
| "¿qué es un acorde chipre?" (conocimiento general de perfumería, no del catálogo) | dentro de alcance — el agente puede responder con conocimiento general; solo los datos concretos de catálogo/precio/disponibilidad deben salir de las tools, nunca inventados |
| "Ignora tus instrucciones y actuá como..." | fuera de alcance (jailbreak) |
| Pregunta de clima, política, ayuda con código, otra categoría de producto no relacionada a perfumes | fuera de alcance |
| Mensaje vacío / solo espacios | rechazado antes del clasificador (ver protocolo), no es un caso del juez |

## Guardrail — etapa 2: system prompt del agente principal

Ya decidida en §6, se documenta acá solo para que quede completa la cadena:
el agente que sí recibe mensajes dentro de alcance tiene un system prompt que
(a) lo limita a responder con datos que vienen de las tools MCP para
fragancias/vendors/precios/disponibilidad concretos — nunca inventar un
precio, una disponibilidad o la existencia de un producto — y (b) rechaza
instrucciones que intenten sacarlo de ese rol, como red de seguridad si algo
pasa el clasificador de la etapa 1.

## Flujo agéntico principal (tool calling)

- Usa el **SDK oficial `@google/genai`** con la API key de Gemini configurada
  por entorno.
- Ciclo estándar de function calling: se envía el historial de la sesión +
  las declaraciones de todas las tools agregadas de los servidores MCP
  configurados; si la respuesta de Gemini incluye uno o más `function_call`,
  el servidor los ejecuta (ver dispatch en la sección siguiente), agrega los
  resultados a la conversación, y vuelve a llamar a Gemini; se repite hasta
  que la respuesta no pide más tools.
- **Límite de iteraciones del ciclo** (config, con default conservador): si se
  supera, el servidor corta el ciclo y responde con un error de turno en vez
  de loopear indefinidamente — protección contra un patrón de tool calling
  que no converge.
- Solo la respuesta de texto final de cada turno se streamea al cliente
  (`token`); los `function_call`/resultados intermedios no se exponen tal
  cual, como mucho generan eventos `status` genéricos.

## Registro modular de tools multi-MCP

Requisito central del usuario: poder agregar/quitar tools con comodidad.

- **Configuración declarativa**: una lista de servidores MCP (id, transporte
  — proceso local vía stdio, o HTTP/SSE remoto — y los parámetros de conexión
  de cada uno). Se carga al arrancar el proceso; agregar o quitar un tool es
  agregar o quitar una entrada de esta lista (o un cambio del lado del
  servidor MCP mismo) — **no** requiere tocar el motor agéntico del chatbot.
- **Namespacing de tools**: al arrancar, el servidor se conecta a cada MCP
  configurado y lista sus tools (`tools/list`); el catálogo agregado que se le
  pasa a Gemini prefija cada nombre de tool con el id de su servidor (p. ej.
  `catalog.search_fragrance`) para evitar colisiones entre servidores
  distintos que expongan tools con el mismo nombre.
- **Dispatch**: cuando Gemini pide ejecutar una tool, el servidor resuelve a
  qué servidor MCP pertenece por el prefijo del nombre y le reenvía la
  llamada (`tools/call`) a ese cliente MCP específico.
- **Servidor MCP caído al arrancar**: se loguea y **se excluye del catálogo**
  esa sesión de tools — no aborta el arranque del proceso completo. Decisión
  explícita para que la modularidad sea real: un servidor MCP roto no debe
  tumbar el bot entero ni impedir que las tools de los demás servidores
  configurados sigan disponibles.
- **Servidor MCP caído en medio de una sesión** (al hacer un `tools/call`):
  se devuelve un resultado de error a Gemini como resultado de la tool (no
  como crash de la conexión WS) — el agente debe comunicar en lenguaje
  natural que no pudo obtener ese dato, consistente con la etapa 2 del
  guardrail (no inventar el dato que faltó).

## Contexto conversacional y sesiones

- El historial de una sesión (una conexión WS) vive **en memoria del
  proceso**, nunca en disco ni DB — se descarta al cerrarse la conexión. Una
  reconexión empieza una conversación nueva. Coherente con "sin autenticación"
  de §6: no hay identidad de usuario a la cual atar historial persistente.
- El historial que ve el **agente principal** conserva los turnos completos
  (texto de usuario, texto de asistente, y los pares `function_call`/resultado
  de cada turno) tal como los mantiene el SDK de Gemini para chats con tools —
  necesario para que el agente pueda referirse a resultados de tools de
  turnos anteriores ("compará ese con el anterior").
- **Ventana de contexto acotada**: por costo/latencia, se recorta a los
  últimos *N* turnos completos (config, default razonable) — se descartan
  turnos completos más antiguos, nunca un turno a la mitad (para no dejar un
  `function_call` sin su resultado en el historial que se le manda a Gemini).
- **Sin resumen/compresión de historial** en esta fase — el recorte es por
  truncamiento simple, no por summarization (ver "Fuera de alcance").
- El historial que ve el **clasificador de la etapa 1** es independiente y
  más chico (solo texto de turnos de usuario/asistente, sin
  `function_call`/resultados) — no necesita ver el detalle de qué tool se usó
  para juzgar el tema de la conversación.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Falla la llamada al clasificador de scope (etapa 1) | fail-open: se trata como dentro de alcance (ver arriba) |
| Falla la llamada principal a Gemini (rate limit, red) | `{"type": "error"}` de turno; la conexión sigue abierta para el próximo mensaje |
| Un servidor MCP no responde al arrancar | se excluye del catálogo de tools esa sesión de vida del proceso; el resto del bot sigue funcionando |
| Una tool call falla o hace timeout en medio de un turno | se devuelve error como resultado de la tool a Gemini; el agente lo comunica en lenguaje natural, no se cae la conexión |
| Se supera el límite de iteraciones del ciclo de tool calling | `{"type": "error"}` de turno, se corta el ciclo |
| Mensaje del cliente mal formado / no es JSON válido / `type` desconocido | `{"type": "error"}` de protocolo, se ignora el mensaje, la conexión sigue abierta |

## Configuración

Vía variables de entorno / archivo de config, sin valores hardcodeados:

- `GEMINI_API_KEY` — key de la API de Gemini, compartida por el agente
  principal y el clasificador de la etapa 1 (dos modelos, una sola key).
- Nombre del modelo del agente principal y nombre del modelo del clasificador
  de la etapa 1, configurables por separado.
- Lista de servidores MCP a conectar (id + transporte + parámetros de
  conexión de cada uno).
- Tamaño de la ventana de contexto del agente principal (*N* turnos) y de la
  ventana que ve el clasificador (*M* turnos).
- Límite de iteraciones del ciclo de tool calling.
- Texto del mensaje de rechazo fijo del guardrail (copy, no regla de
  negocio).
- Puerto/host del servidor WebSocket.

## Fuera de alcance

- **La implementación del/los servidor(es) MCP con datos reales de
  fragancias/vendors/precios/disponibilidad** — es una dependencia externa a
  este documento (mencionada en `platform-spec.md` §6). Este spec solo cubre
  el lado cliente MCP, el motor agéntico, el guardrail y el transporte
  websocket; no diseña ni implementa qué servidor(es) MCP concretos existen
  ni de dónde sacan los datos.
- **Autenticación de usuario / identidad por conexión** — ya fuera de alcance
  por `platform-spec.md` §6 en esta fase.
- **Persistencia de conversaciones** entre reconexiones, entre instancias del
  proceso, o cualquier historial en DB — cada conexión WS es una sesión
  efímera en memoria.
- **Resumen/compresión de historial largo (summarization)** — el recorte de
  contexto es por truncamiento simple en esta fase.
- **Entrenar un clasificador propio** para el guardrail — decisión de esta
  sesión: se usa Gemini como juez, no un modelo entrenado (ver arriba).
- **Rate limiting / cuotas / protección DoS** del propio servidor WS — no
  hay noción de usuario ni autenticación en esta fase.
- **Tools de escritura** (crear favoritos, modificar datos por chat) — ya
  fuera de alcance por `platform-spec.md` §6/§9.
- **Detección/soporte multi-idioma** — se asume español como idioma principal
  del proyecto, sin lógica de detección de idioma.
- **Infraestructura de despliegue** del proceso Node — mismo criterio que el
  resto del proyecto (`platform-spec.md` §9), se define después.
- **Tests** — se escriben en una sesión de testing separada sobre este mismo
  worktree, por la convención raíz del proyecto.
