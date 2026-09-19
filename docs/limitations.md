# Limitaciones


> Solo limitaciones verificadas en el código, en el compose o en documentación del repo. Lo que no se pudo verificar está marcado `TODO(verificar)`.

## Datos simulados

- Tiendas (5, dominios `.example.com`), precios, tamaños, stock y URLs de producto son inventados por [`priceGenerator`](../priceGenerator). **No es un comparador de precios real.**
- Precio en rango 15.000–150.000 CLP independiente del perfume real (una fragancia de nicho y una barata pueden costar lo mismo); el tamaño en ml se deduce del precio.
- Catálogo con nombres/marcas reales de un dataset de Kaggle, pero descripciones inventadas por plantilla y sin imágenes ni notas olfativas reales.
- Sin scraping ni actualización periódica: los datos cambian solo si alguien vuelve a ejecutar los scripts.

## Modelo de embeddings y búsqueda semántica

- Modelo genérico multilingüe pequeño (`paraphrase-multilingual-MiniLM-L12-v2`), sin ajuste al dominio. No hay evaluación de relevancia en el repo. > TODO(verificar)
- Se indexa solo la descripción plantillada: la similitud refleja poco más que marca/nombre/familia/público/longevidad/concentración.
- HNSW aproximado; a ~1.000 elementos no aporta mejora medible frente a fuerza bruta (decisión de aprendizaje y escalabilidad hipotética).
- Índice identificado por `name`: nombres repetidos entre marcas son ambiguos.
- Se sincroniza solo al arrancar; reconstrucción completa del grafo ante cualquier cambio; un solo proceso.
- Sin filtros ni paginación en `/search`.
- Cambiar `SIMILARITY_MODEL_NAME` exige borrar el volumen `similarity_data` (reindexado completo); tras importar catálogo con el sistema arriba hay que reiniciar `similarity` para que lo indexe.
- El arranque de `similarity` puede tardar minutos (el healthcheck de compose tolera hasta 300 s) y la imagen pesa unos 2 GB (torch CPU + modelo).

## Búsqueda textual

- Sin ranking por relevancia (orden por `id`), sin tolerancia a erratas ni normalización de acentos; máximo 5 tokens y 100 caracteres.
- `name` y `brand` ya no existen como filtros; un cliente que los envíe es ignorado sin error (ver [`features/busqueda-textual.md`](features/busqueda-textual.md)).

## Chatbot

- En Docker el chatbot usa `chatbot/mcp-servers.docker.json` (backend y similarity). Fuera de Docker, `chatbot/mcp-servers.json` está vacío por defecto y el agente no tiene tools hasta configurarlo.
- Sin `GEMINI_API_KEY` el chatbot termina al arrancar (con error explícito; compose reintenta 3 veces) y el resto del sistema sigue funcionando.
- El ciclo de tool calling tiene tope de 14 pasos por pregunta (`CHATBOT_MAX_TOOL_ITERATIONS`); preguntas que encadenan muchas búsquedas y precios (p. ej. "parecido a X pero más barato") aún pueden agotarlo y responder "Se superó el límite de pasos"; el prompt y la memoización por turno reducen el consumo pero no lo garantizan.
- **Latencia alta por la API de Gemini.** Una respuesta tarda entre unos 5 s (pregunta simple o fuera de catálogo) y unos 40 s (varias recomendaciones con precio), en pruebas manuales con 4 preguntas. Cada paso del ciclo de tool calling es una llamada secuencial a Gemini (más la del clasificador de alcance al inicio), y el tiempo crece con el número de pasos; las tools locales (Postgres, índice HNSW) responden en milisegundos. Se atribuye principalmente a Gemini, pero no hay instrumentación que separe el tiempo de Gemini del de las tools. El widget muestra el estado de cada tool mientras espera; la latencia depende además del modelo y de la cuota de la clave.
- Guardrail basado en LLM, con clasificador que falla abierto; no es barrera dura.
- Depende de un servicio externo (Gemini) y de su clave; modelos con fallback pero sin garantía de disponibilidad.
- Sesión en memoria, sin persistencia ni identidad de usuario; solo lectura.
- Recomendaciones = búsqueda semántica + datos simulados, no un motor de recomendación. Sin evaluación formal de calidad en el repo; los specs del widget del chatbot no tienen registrado un ciclo completo de testing de caja negra (según notas del proyecto).

## Escalabilidad

- Diseñado y probado a ~1.000 perfumes y 5 tiendas; los índices y la paginación por cursor están pensados para crecer, pero solo se midieron en datasets sintéticos ([`backend/src/database/NOTES.md`](../backend/src/database/NOTES.md)).
- El índice vectorial vive en RAM de un proceso y se persiste en un archivo local; no escala horizontalmente tal como está.
- La comparación de precios se hace en el cliente: el frontend descarga todos los listings del perfume (páginas de 100) y los ordena localmente; no hay mejor precio calculado en el servidor.

## Ausencia de características de producción

- Sin scheduler de jobs, monitoreo, métricas ni observabilidad centralizada.
- Sin autenticación en `/search`, `/mcp` (backend y similarityServer) ni en el WebSocket del chatbot; rate limiting solo en el backend REST (100/min global, 5/min login y registro).
- Sin historial de precios, alertas, pagos ni checkout.
- Sin recuperación de contraseña ni verificación de email (no hay endpoints ni pantallas; verificado por búsqueda en `backend/src` y `frontend/src`).
- Login social (Google/Apple) solo decorativo: los botones están deshabilitados y no existe backend de social auth ([`AuthSocialRow.tsx`](../frontend/src/features/auth/components/AuthSocialRow.tsx)).
- Sin usuario admin de fábrica: hay que promover un usuario a mano en la base (ver [`local-setup.md`](local-setup.md)).
- Existe un `docker-compose.yml` para levantar todo el stack en local, pero no hay TLS, reverse proxy, CI/CD (no hay `.github/`) ni configuración de despliegue en la nube. Ver [`production.md`](production.md).
- Esquema compartido entre TypeScript y Python acoplado a mano.
- El bug de `error.code` vs `error.cause.code` (violaciones de constraint no detectadas) está corregido: todos los servicios usan `getPgErrorCode` ([`backend/src/database/NOTES.md`](../backend/src/database/NOTES.md)). Sigue abierto un detalle de UX: el formulario de registro muestra cualquier 409 bajo el campo email aunque el duplicado sea el nombre ([`backend/src/auths/NOTES.md`](../backend/src/auths/NOTES.md)).
