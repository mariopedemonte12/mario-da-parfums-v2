# Limitaciones

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Solo limitaciones verificadas en el código o en documentación del repo. Lo no verificado está marcado `TODO(verificar)`.

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

## Búsqueda textual

- Sin ranking por relevancia (orden por `id`), sin tolerancia a erratas ni normalización de acentos; máximo 5 tokens y 100 caracteres.
- Depende de que la rama `search` esté integrada. > TODO(verificar)

## Chatbot

- Sin tools si `chatbot/mcp-servers.json` (vacío en el repo) no se configura. > TODO(verificar)
- Guardrail basado en LLM, con clasificador que falla abierto; no es barrera dura.
- Depende de un servicio externo (Gemini) y de su clave; modelos con fallback pero sin garantía de disponibilidad.
- Sesión en memoria, sin persistencia ni identidad de usuario; solo lectura.
- Recomendaciones = búsqueda semántica + datos simulados, no un motor de recomendación. Sin evaluación formal de calidad. > TODO(verificar)

## Escalabilidad

- Diseñado y probado a ~1.000 perfumes y 5 tiendas; los índices y la paginación por cursor están pensados para crecer, pero solo se midieron en datasets sintéticos ([`backend/src/database/NOTES.md`](../backend/src/database/NOTES.md)).
- El índice vectorial vive en RAM de un proceso y se persiste en un archivo local; no escala horizontalmente tal como está.
- La comparación de precios se hace en el cliente sobre una página de 20 listings.

## Ausencia de características de producción

- Sin scheduler de jobs, monitoreo, métricas ni observabilidad centralizada.
- Sin autenticación en `/search`, `/mcp` (backend y similarityServer) ni en el WebSocket del chatbot; rate limiting solo en el backend REST (100/min global, 5/min login y registro).
- Sin historial de precios, alertas, pagos ni checkout.
- Sin recuperación de contraseña ni verificación de email. > TODO(verificar)
- Infra Docker completa, despliegue y CI/CD: > TODO(verificar) según la infra final (en la rama base solo hay compose de Postgres y un Dockerfile del priceGenerator).
- Esquema compartido entre TypeScript y Python acoplado a mano.
- Bugs conocidos documentados en el repo: los servicios de `listings`, `vendors` y `fragrances` no detectan violaciones de constraint reales porque leen `error.code` en vez de `error.cause.code` ([`backend/src/database/NOTES.md`](../backend/src/database/NOTES.md)). > TODO(verificar): si sigue vigente.
