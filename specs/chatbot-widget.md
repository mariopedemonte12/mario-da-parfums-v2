# chatbot-widget — panel flotante + mascota "Sensei" (frontend)

## Contexto y dependencias

Implementa el **cliente** del chatbot en `frontend/`: el panel flotante visible en
todas las rutas y la mascota "Sensei", que hablan el protocolo websocket ya
implementado en `chatbot/` — ver [`chatbot-server.md`](chatbot-server.md), que este
documento no repite ni reabre, solo consume.

Depende únicamente de `design-foundation` (ya mergeado: tokens de `globals.css`,
fuentes Cormorant Garamond/Jost, `WindLines`). No depende de `fragrances-public-read`
ni de ninguna otra feature — el chatbot no muestra datos estructurados de catálogo,
solo texto conversacional que el propio agente ya redacta en lenguaje natural.

Referencia visual: `frontend/designGuidelines/Mario da Parfums.dc.html`, artboard
**1d** ("Chatbot 'Sensei' — panel abierto + personaje sumi-e"). El SVG de cuerpo
completo del sensei es un boceto explícito ("ilustración final por encargo") — se
implementa la animación/comportamiento alrededor de ese placeholder, sin inventar
arte nuevo.

## Qué es, en términos generales

Un widget flotante disponible en cualquier ruta de la app: un panel de chat que se
abre/cierra, con historial en memoria del browser (no persiste al recargar) y una
mascota "Sensei" con una animación idle de "respiración" y un indicador de 3 puntos
mientras el turno está en curso. Habla el protocolo de `chatbot-server.md` sin
alterarlo ni asumir capacidades que ese servidor no ofrece (no hay saludo
espontáneo del servidor al conectar, no hay sugerencias estructuradas, no hay
autenticación).

## Disparador: botón "Sensei" en el Navbar

`features/layout/components/Navbar.tsx` ya tiene un `<span>Sensei</span>` sin
comportamiento. Pasa a ser un `<button>` que hace toggle del panel (abrir si está
cerrado, cerrar si está abierto). Es el único punto de entrada al widget — no hay
burbuja flotante adicional en la esquina de la pantalla; lo que "flota" es el panel
mismo, posicionado fixed sobre el contenido de la ruta actual, no wireframed
dentro del layout de la página.

## Conexión websocket: perezosa y persistente en la sesión del tab

- **Perezosa**: la conexión WS se abre recién la **primera vez** que el panel se
  abre (primer click en "Sensei" con panel cerrado→abierto), nunca en la carga de
  la página ni en el montaje del layout. El widget está montado en todas las rutas,
  así que conectar en el montaje conectaría en cada carga de página — exactamente
  lo que se quiere evitar.
- **Persistente entre toggles**: cerrar el panel **no** cierra el socket ni
  descarta el historial de mensajes — son estados independientes (`isOpen` del
  panel vs. la sesión de chat). Reabrir el panel muestra la conversación tal como
  quedó. Esto es coherente con "historial solo en memoria de la sesión del
  browser" del prompt de la feature: la sesión vive mientras dura el tab, no
  mientras el panel está visible.
- **Se pierde al recargar la página** (nueva carga de JS → nuevo estado en
  memoria, nueva conexión perezosa la próxima vez que se abra el panel). Esto es
  coherente con que el propio servidor tampoco persiste su contexto entre
  reconexiones.
- **Nota importante para testing**: una reconexión (por ejemplo, tras una caída de
  red y un reintento) abre una sesión **nueva en el servidor** (`chatbot-server.md`:
  "una reconexión empieza una conversación nueva" — el agente pierde el contexto
  de turnos anteriores), aunque el **historial visual en el panel del cliente siga
  mostrando los mensajes previos** (no se borra la transcripción del lado UI). Es
  un comportamiento esperado, no un bug: el cliente no tiene forma de re-hidratar
  el contexto perdido del servidor, y no se implementa ningún mecanismo para
  disimularlo (p. ej. un aviso "se reinició la conversación") en esta fase.

## Un turno a la vez

- Mientras un turno está en curso (desde que se envía un `message` hasta que llega
  `done` o `error`), el input y el botón de enviar quedan deshabilitados — no se
  puede disparar un segundo `message` en la misma conexión, tal como exige el
  protocolo.
- Mensaje vacío o solo espacios: **no se envía**, se bloquea a nivel de UI (botón
  deshabilitado / submit no-op). Es una validación de UX, redundante con el
  rechazo que igual hace el servidor a nivel de protocolo — no se depende de esa
  redundancia, se evita la llamada innecesaria desde el cliente.

## Estados del panel y mapeo con el mock

El artboard 1d muestra dos tarjetas: el panel de chat en uso (header + burbujas +
input) y una tarjeta separada, más grande, dedicada a mostrar el sensei de cuerpo
completo con su nota de dirección de arte. La segunda tarjeta es documentación
para el ilustrador, no una pantalla aparte a implementar tal cual — pero el
prompt de la feature pide explícitamente "mascota Sensei con animación idle
breathing" como parte de los componentes a construir, así que el panel real
combina ambos en dos estados, decisión de esta sesión:

- **Estado vacío** (panel recién abierto, sin mensajes todavía — el servidor no
  saluda espontáneamente, así que no hay mensaje del bot hasta que el usuario
  escribe el primero): se muestra el sensei de cuerpo completo (SVG del mock,
  clase de respiración idle) centrado, con la copy de dirección de arte del mock
  a modo de bienvenida estática (no es un mensaje del bot, es contenido de UI).
  El input ya está visible y usable desde este estado.
- **Estado con conversación** (en cuanto existe al menos un mensaje — del usuario
  o del asistente): el panel muestra la lista de burbujas tal como la tarjeta 1
  del mock (header con el glifo pequeño del sensei, burbujas usuario/asistente,
  input al pie). El sensei de cuerpo completo no vuelve a aparecer dentro de esa
  misma sesión de panel — el glifo del header cubre la presencia del personaje
  durante la conversación, igual que en el mock.
- La transición entre ambos estados es unidireccional dentro de una sesión del
  panel: una vez que hay mensajes, no se vuelve al estado vacío (ni siquiera si
  el usuario cierra y reabre el panel, porque el historial persiste).

## Indicador de "pensando" (3 puntos) y animación idle

- El glifo pequeño del sensei en el header respira (animación idle en loop)
  permanentemente mientras el panel está montado — no depende del estado de la
  conexión ni del turno.
- Mientras un turno está en curso y **todavía no llegó ningún `token`** de la
  respuesta final (es decir, mientras solo hubo o puede haber eventos `status`,
  o directamente silencio), se muestra el indicador de 3 puntos pulsantes en el
  lugar donde aparecería la próxima burbuja del asistente. Si llega un evento
  `status`, su texto se muestra junto/en lugar de los puntos (p. ej. "Buscando en
  el catálogo…") — es información opcional, el indicador de puntos solo no
  requiere que haya habido un `status` para aparecer.
- En cuanto llega el primer `token` del turno, el indicador desaparece y en su
  lugar se empieza a construir la burbuja de respuesta del asistente,
  incorporando cada `token` sucesivo en orden (streaming visual, no hay
  animación de "escritura" adicional más allá de que el texto crece).
- Respeta `prefers-reduced-motion`: tanto la respiración del sensei como el pulso
  de los 3 puntos se desactivan (quedan estáticos) si el usuario tiene reducción
  de movimiento activada.

## Formato de la burbuja de texto del asistente

Decisión de esta sesión: la burbuja de texto del asistente (no las fichas de
perfume, que son un componente aparte) renderiza markdown básico —
**negrita**, listas con viñetas/numeradas — con `react-markdown`, en vez de
texto plano. Encontrado en testing manual: Gemini emite markdown (`**...**`,
listas con `*`) espontáneamente aunque el system prompt no se lo pide, y
mostrarlo como texto plano dejaba los asteriscos literales visibles al
usuario. Los mensajes del usuario y las entradas de `error` siguen siendo
texto plano tal cual (no se interpreta markdown que el usuario haya tipeado,
ni el copy fijo de error). Links no se renderizan como clickeables (ver
"Fuera de alcance") — no hace falta, ya cubierto por las fichas de perfume.

## Tarjetas de perfume estructuradas

Decisión de esta sesión, en conjunto con `specs/chatbot-server.md`,
"Tarjetas de perfume estructuradas": cuando llega un
`{"type": "fragrances", "items": [...]}`, el cliente agrega una entrada al
historial (no una burbuja de texto) con una ficha por perfume — nombre,
marca, precio, la ilustración placeholder de botella del sistema de diseño
(nunca `imageUrl` directamente, ver `frontend/CLAUDE.md`) y un link "ver en
el catálogo".

- `price: null` **no se muestra como "sin stock"** — ver
  `specs/chatbot-server.md`, "Tarjetas de perfume estructuradas": el agente
  manda `null` tanto si confirmó que no hay stock como si simplemente no
  consultó el precio en ese turno (p. ej. el usuario solo pidió un listado).
  El cliente no puede distinguir esos dos casos, así que para `price: null`
  la ficha omite el monto y el link dice "ver precio y stock" en vez de "ver
  en el catálogo" — nunca afirma que el perfume no tiene stock sin que una
  tool lo haya confirmado.

- Puede llegar más de una vez por turno (0 o más), siempre antes o
  intercalado con los `token` de la respuesta final — se agrega en el orden
  en que llega, como cualquier otro evento del turno.
- **Link "ver en el catálogo" — decisión interina**: apunta a
  `/fragrances?q=<nombre del perfume>`, reutilizando el buscador existente de
  `/fragrances` (que ahora también lee `?q=` para precargar el filtro). Esto es
  un puente hasta que exista `/fragrances/[id]` (artboard 1f, "Product
  detail", todavía no implementado en este worktree) — cuando esa página
  exista, el link debería apuntar ahí por id en vez de filtrar por nombre.
  No es una limitación del protocolo (el payload ya incluye `id`), es que el
  frontend todavía no tiene dónde llevarlo.
- No hay reordenamiento ni deduplicación de fichas entre turnos — si el
  agente vuelve a presentar el mismo perfume en un turno posterior, aparece
  una ficha nueva, igual que una burbuja de texto repetida.

## Manejo de `error` de turno

- Un `{"type": "error"}` de turno **no cierra la conexión** (`chatbot-server.md`).
  El cliente lo refleja como una entrada distinguible en el historial (mismo
  listado de mensajes, con un estilo visual distinto al de una respuesta del
  asistente — no se inventa contenido, se muestra el `text` que manda el
  servidor tal cual).
- Cualquier texto parcial que se hubiera empezado a streamear como `token` antes
  del `error` del mismo turno **se descarta** (no queda una burbuja de asistente a
  medias) — solo se conserva la entrada de error.
- Tras un error de turno, el input se vuelve a habilitar de inmediato: el usuario
  puede reintentar con un mensaje nuevo sin acciones adicionales.

## Pérdida de conexión inesperada

- Si el socket se cierra o entra en error **mientras hay un turno en curso** (sin
  que haya llegado `done`/`error` de protocolo — p. ej. caída de red), el cliente
  lo trata igual que un error de turno de cara al usuario: agrega una entrada de
  error genérica al historial ("se perdió la conexión…"), descarta cualquier
  streaming parcial, y vuelve a habilitar el input.
- El próximo intento de envío dispara una reconexión (nueva conexión WS) de forma
  transparente — el usuario no tiene que hacer nada distinto de escribir y
  enviar de nuevo. No hay reintento automático en segundo plano ni backoff: la
  reconexión es bajo demanda, disparada por la siguiente acción del usuario. Ver
  la nota de "sesión nueva en el servidor" más arriba — es una limitación
  conocida, no un bug a resolver en esta fase.
- No hay un indicador visual persistente de "estado de conexión" fuera de los
  mensajes de error puntuales — no se agrega un semáforo/badge de conectividad no
  pedido por el mock ni por el protocolo.

## Fuera de alcance

- **Chips de sugerencia** ("más fresco", "más envolvente", "ver notas") que
  aparecen en el mock bajo el último mensaje del bot: el protocolo de
  `chatbot-server.md` no manda sugerencias estructuradas, solo texto — agregar
  chips requeriría inventar contenido no provisto por el servidor. Queda fuera de
  esta implementación; se puede reabrir si el servidor llega a exponer ese dato.
- **Reintento automático / reconexión en segundo plano con backoff** — la
  reconexión es bajo demanda (ver arriba).
- **Persistencia de historial** entre recargas de página, pestañas o
  dispositivos — el historial vive en memoria del cliente durante la sesión del
  tab, igual que el servidor no persiste su contexto entre reconexiones.
- **Autenticación / identidad de usuario en el chat** — ya fuera de alcance por
  `chatbot-server.md`/`platform-spec.md` §6.
- **Links e imágenes embebidas en el texto del asistente** — Gemini no los emite
  en la práctica para este dominio, y las fichas de perfume (`present_fragrances`,
  ver arriba) ya cubren el caso de "perfume + link" de forma estructurada, así
  que no hace falta parsear links del texto libre. Si `ReactMarkdown` recibe uno
  igual, se renderiza como texto plano, no como link clickeable.
- **Ilustración final del sensei** — se usa el boceto sumi-e del mock tal cual;
  el arte final se encarga aparte y se reemplaza sin tocar la lógica de
  animación/estado de este componente.
- **Tests** — se escriben en una sesión de testing separada sobre este mismo
  worktree, por la convención raíz del proyecto (incluye reconexión y errores del
  WS).
