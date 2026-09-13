# chatbot-server — notas de implementación

Ver `specs/chatbot-server.md` para el comportamiento acordado; esto solo cubre
decisiones a nivel de código que el spec no fija.

## Streaming durante iteraciones con tool calls (`agent/chat-agent.ts`)

El spec pide que solo la respuesta final de texto se streamee, y que los
pasos intermedios de tool calling no se expongan token a token. La
implementación reenvía los chunks de texto de Gemini en vivo (`onToken`) en
**cada** iteración del loop, incluida una que también devuelva un
`function_call` — no bufferea-y-descarta por iteración para decidir recién al
final si "era la respuesta final".

Es una apuesta deliberada, no un descuido: en la práctica, cuando Gemini pide
ejecutar una tool casi nunca acompaña esa respuesta con texto visible en el
mismo turno (la llamada a función suele venir sola). Bufferear todo por
iteración para poder descartar texto "por si acaso" hubiera sacrificado el
streaming token-a-token real que es la razón explícita por la que el spec
eligió WebSocket en vez de un endpoint REST. Si en testing aparece un modelo/
prompt que sí narra texto antes de llamar a una tool, ese texto se filtraría
al cliente como si fuera parte de la respuesta — ajustar acá si eso pasa.

## Truncamiento de historial por "turno completo"

Un "turno" es la unidad de truncamiento (nunca se corta a la mitad): un
mensaje de usuario más todo el ida-y-vuelta de tool calling hasta la
respuesta final. El historial del agente principal se guarda como una lista
de turnos (`AgentTurn[]`, cada uno con su propio array de `Content[]`) en vez
de un `Content[]` plano, específicamente para poder recortar por turno
completo sin tener que re-parsear el array plano buscando dónde empieza cada
turno.

## `id` de `function_response` cuando Gemini no manda `id` en el `function_call`

`FunctionResponse` de `@google/genai` pide un `id` para emparejar con su
`FunctionCall`. Cuando Gemini no lo manda (caso normal sin llamadas paralelas
a la misma función), se usa el nombre de la tool como fallback
(`call.id ?? call.name`) — no afecta el emparejamiento porque ese campo solo
importa cuando hay múltiples llamadas concurrentes con el mismo nombre.
