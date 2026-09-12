# Mario da Parfums — especificación de plataforma

Este documento es la ground-truth de **qué es** Mario da Parfums y **qué debe hacer**,
independiente de cómo esté (o no esté) implementado hoy. Es el documento raíz del
proyecto: cada spec de feature (`specs/<feature-slug>.md`, p.ej.
[`vendors-crud.md`](./vendors-crud.md), [`fragrances-crud.md`](./fragrances-crud.md))
debe ser consistente con lo que se define acá. Si una feature spec y este documento
entran en conflicto, se actualiza este documento explícitamente (con el usuario) antes
de seguir — nunca se asume que la feature spec más nueva "gana" en silencio.

No es un documento de diseño ni de implementación: define comportamiento, reglas de
negocio y alcance, no estructura de código, nombres de tablas ni endpoints exactos
(eso vive en cada feature spec).

## 1. Qué es el producto

Mario da Parfums es una **plataforma comparadora de precios de perfumes en Chile**.
No vende perfumes ni procesa pagos: para cada perfume, muestra en qué vendors está
disponible y a qué precio, y deriva al sitio del vendor para la compra. El valor del
producto es la comparación, no la transacción.

Alcance geográfico/moneda: **Chile, CLP, fijo**. No se modela multi-país ni
multi-moneda; expandir a otros mercados es un cambio futuro explícito, no algo que
el diseño actual deba prever con campos genéricos "por si acaso".

Es un proyecto de aprendizaje/prueba: se opera con una muestra pequeña de vendors y
perfumes para que el scraping sea rápido de iterar y testear, pero el diseño de cada
pieza (matching, actualización in-place, jobs) debe ser el que se usaría a escala real
— la muestra chica es una decisión operativa de esta fase, no una simplificación del
modelo de datos ni de las reglas de negocio.

## 2. Componentes del sistema

| Componente | Rol | Notas |
|---|---|---|
| **Backend** (`backend/`, NestJS) | API única del sistema: gestión admin de vendors, catálogo de fragancias, consulta/comparación de precios, cuentas de usuario y favoritos. | Es el único componente con base de datos propia (Postgres vía Drizzle). No hace scraping. |
| **Worker de precios** | Proceso standalone, separado del backend, corrido por el **job diario**. Por cada fragancia registrada, busca su precio en cada vendor activo y actualiza (o crea) el listing correspondiente. | No expone API pública. Ver §4.2. |
| **Worker de catálogo** | Proceso standalone, separado del backend, corrido por el **job semanal**. Hace scraping de Fragrantica para mantener actualizado el catálogo de fragancias. | No expone API pública. Ver §4.1. |
| **Chatbot / asistente** (`chatbot/`) | Servidor aparte del backend. Responde preguntas sobre perfumes y precios usando un servidor MCP como única vía de acceso a los datos. | Ver §6. |
| **Frontend** (`frontend/`) | Consumidor de la API del backend. | Fuera del detalle de este documento salvo por los flujos de usuario que exige (favoritos, comparación). |

Los dos workers y el backend comparten el mismo esquema de base de datos (son la
misma base de datos física), pero **los workers escriben directo a la base de
datos, no a través de la API REST del backend** — el backend no es un intermediario
obligado para el scraping, porque el volumen y la cadencia de escritura de los jobs
no tiene por qué pasar por el mismo pipeline de validación HTTP que las mutaciones
de un admin humano. Los workers sí deben respetar las mismas constraints del
esquema (unicidad, FKs) que el backend.

La orquestación concreta de los jobs (cron dentro del propio worker vs. scheduler
externo) es una decisión de infraestructura y se resuelve al final del proyecto
(ver §9, "infraestructura al final" ya acordado con el usuario) — este documento
solo fija que existen exactamente dos cadencias, semanal y diaria, y qué hace cada
una.

## 3. Modelo de dominio (conceptual)

No son nombres de tabla obligatorios, son las entidades que el negocio necesita:

- **Vendor**: un retailer chileno del que se obtienen precios. Gestionado por un
  admin (crear/editar/borrar). Ya especificado en
  [`vendors-crud.md`](./vendors-crud.md).
- **Fragrance**: un perfume del catálogo canónico. Su fuente de verdad es
  Fragrantica (vía el job semanal); el CRUD admin sobre fragancias
  ([`fragrances-crud.md`](./fragrances-crud.md)) es una vía de gestión manual, no la
  vía principal de llenado de datos en operación normal.
- **Listing**: el precio vigente de **una fragancia, en un tamaño puntual (p.ej.
  50ml, 100ml), en un vendor puntual**. Un mismo par fragancia-vendor puede tener
  varios `Listing` si el vendor la vende en más de un tamaño — cada tamaño es una
  oferta independiente con su propio precio. Es la entidad central del job
  diario — ver §4.2 para sus reglas, que son la parte más crítica de todo el
  sistema.
- **User**: una única cuenta con un campo `role` que puede ser `ADMIN` o `USER`
  (no dos modelos de cuenta separados, un admin es un `User` con `role = ADMIN`).
  Todo `User` se autentica (registro/login); lo que cambia según el rol es qué
  puede hacer, no el tipo de entidad. Los favoritos existen para cualquier `User`
  autenticado, sin distinción de rol (un `ADMIN` también puede tener favoritos).
- **Favorite**: relación N:N entre `User` y `Fragrance`.

## 4. Jobs de scraping

Hay exactamente dos jobs, con propósitos y cadencias distintas y sin superposición
de responsabilidades.

### 4.1 Import de catálogo de fragancias (`perfumeCatalogImporter`)

- **Ya no es scraping en vivo de Fragrantica.** Se decidió explícitamente con
  el usuario abandonar esa vía por riesgo legal de hacer scraping continuo de
  un sitio de terceros — no por una limitación técnica (la implementación
  original funcionaba). En su lugar, el catálogo se puebla desde un dataset
  estático de Kaggle (marcas/nombres de perfumes reales) con descripciones
  100% inventadas por este proyecto. Ver
  [`specs/perfume-catalog-import.md`](specs/perfume-catalog-import.md) para el
  detalle completo, incluyendo por qué cambió el scope.
- **Cadencia**: bajo demanda / manual en esta fase (el dataset es estático, no
  cambia semana a semana como cambiaría un sitio en vivo) — no una corrida
  automatizada por ahora.
- **Propósito**: mantener el catálogo de `Fragrance` poblado con perfumes
  reales (marca, nombre) y metadatos derivados del dataset (concentración,
  descripción sintética). No incluye imágenes (el dataset no las trae).
- Incluye además un componente chico de ML (embeddings + similitud coseno)
  para búsqueda de perfumes por descripción libre — ver
  `specs/perfume-catalog-import.md` para el mecanismo (embeddings +
  similitud coseno) y `specs/perfume-similarity-search.md` para cómo se
  expone: un servidor FastAPI (`perfumeCatalogImporter/app.py`) — el backend
  NestJS no carga el modelo ni corre encoders, consultaría este servicio por
  HTTP (integración con el backend todavía no implementada).
- **No** toca precios ni vendors — esa es responsabilidad exclusiva del job diario.

### 4.2 Job diario — precios por vendor (parte más crítica del proyecto)

- **Cadencia**: diaria.
- **Propósito**: por cada `Fragrance` registrada, buscar su precio en cada `Vendor`
  activo y dejar reflejado el precio vigente.
- **Regla central**: **no se crea una fila nueva de precio cada día.** Existe una
  única fila `Listing` por tripleta `(fragranceId, vendorId, tamaño)`; el job la
  actualiza in-place. Una fila de `Listing` nueva solo se crea la primera vez que
  se detecta que un vendor vende una fragancia dada en un tamaño dado (no existía
  esa combinación todavía) — a partir de ahí, todas las corridas diarias
  siguientes actualizan esa misma fila.
- **Campos que importa que existan en `Listing`** (conceptual, no nombres de columna
  obligatorios): fragancia, vendor, tamaño (p.ej. mililitros), precio actual (CLP,
  entero), URL del producto en el sitio del vendor, si está actualmente
  disponible, y cuándo se revisó por última vez.
- **Sin historial de precios** (decisión acordada con el usuario): el `Listing`
  guarda **solo el precio actual**, no precios anteriores, ni una tabla de
  historial separada. No hay feature de "bajó de precio" ni de tendencia — se
  evaluó explícitamente agregar un campo de precio anterior en la misma fila y se
  descartó para esta fase; si se quiere en el futuro, es un cambio de schema
  aparte, no algo que el job diario deba producir hoy.
- **Delisting — vendor que deja de vender una fragancia** (decisión acordada con el
  usuario): se agrega un flag `isAvailable` (booleano) al `Listing`. Si en una
  corrida el scraper no encuentra la fragancia en el sitio del vendor, se marca
  `isAvailable = false` y **se conserva el último precio conocido** como
  referencia (no se borra la fila, no se pierde el dato). Si vuelve a aparecer,
  se marca `isAvailable = true` de nuevo y se actualiza el precio — sigue siendo
  la misma fila, no una nueva.
- **Matching fragancia → producto del vendor**: la primera vez que se detecta una
  combinación `(fragancia, vendor, tamaño)`, el worker necesita encontrar la URL
  del producto (o variante de producto, si el vendor expone tamaños distintos
  como variantes de una misma página) en el sitio del vendor (búsqueda/matching
  por nombre + marca + tamaño). Una vez encontrada,
  esa URL se persiste en el `Listing` y las corridas siguientes scrapean
  directamente esa URL en vez de volver a buscar — evita rehacer el matching todos
  los días. Mejorar ese matching (fuzzy matching más robusto, manejo de
  variantes/ediciones limitadas, etc.) es optimización futura explícitamente
  diferida por el usuario, igual que el delta del job semanal.
- **Fallas de scraping** (vendor caído, cambio de estructura del sitio, timeout):
  no deben aportar al negocio como "el perfume ya no está disponible". Una falla
  de scraping dista de un producto no encontrado: el manejo concreto de reintentos
  y de cuándo una falla se traduce en `isAvailable = false` (vs. simplemente
  reintentar en la corrida siguiente sin tocar el listing) queda para la spec de
  implementación del worker, pero la regla de negocio es: **`isAvailable = false`
  se reserva para "el vendor no lo vende", no para "no pudimos scrapearlo hoy"**.

## 5. Backend — alcance de la API

El backend es deliberadamente simple: no hace scraping, no orquesta jobs, solo
sirve y gestiona datos.

### 5.1 Gestión de vendors (admin)

Ya especificado en [`vendors-crud.md`](./vendors-crud.md): CRUD batch, admin-only
para mutaciones, lectura pública.

### 5.2 Catálogo de fragancias (admin)

Ya especificado en [`fragrances-crud.md`](./fragrances-crud.md): CRUD batch,
admin-only. En operación normal el job semanal es quien mantiene el catálogo al
día; el CRUD admin es una vía de corrección/gestión manual, no el flujo principal.

### 5.3 Consulta y comparación de precios

Alcance funcional (sin fijar endpoints exactos, eso es de la feature spec
correspondiente cuando se construya):

- Listar los listings (precio + vendor + disponibilidad) de una fragancia dada,
  para comparar entre vendors.
- Encontrar el vendor más barato disponible para una fragancia dada.
- Buscar/filtrar fragancias (por nombre, marca, etc.) con su mejor precio actual.
- Filtrar listings por disponibilidad (`isAvailable`).
- Acceso de lectura: público (igual criterio que vendors/fragancias de solo
  lectura), sin necesitar cuenta de usuario — comparar precios no requiere login.

### 5.4 Cuentas de usuario y favoritos

- Hay un único modelo de cuenta (`User`) con un campo `role` (`ADMIN` / `USER`) y
  un solo flujo de registro/login (JWT) para ambos — no hay una cuenta de admin
  separada de la de un usuario normal. El rol determina qué endpoints puede usar
  (p.ej. mutaciones de vendors/fragancias son admin-only), no a qué sistema de
  autenticación pertenece.
- Un usuario autenticado puede marcar/desmarcar una `Fragrance` como favorita y
  listar sus favoritos.
- El listado de favoritos debe poder combinarse con la info de precios (para que
  "ver mis favoritos" ya muestre dónde comprarlos más barato), no ser solo una
  lista de IDs.
- No hay niveles de usuario más allá de `USER`/`ADMIN`, ni perfiles sociales,
  ni compartir listas de favoritos entre usuarios.

## 6. Chatbot / asistente conversacional

- **Servidor separado** del backend (`chatbot/`), con su propio ciclo de vida y
  despliegue.
- **Servidor MCP**: es la única vía por la que el agente accede a datos. Expone
  herramientas de **solo lectura** sobre fragancias, vendors, precios y
  disponibilidad (buscar fragancia, comparar precios, encontrar el más barato).
  El agente no tiene, en esta fase, herramientas de escritura (no puede crear
  favoritos ni modificar datos por chat) — eso es explícitamente fuera de alcance
  del chatbot hoy (ver §9).
- **Alcance conversacional**: el agente solo puede responder preguntas sobre
  perfumes (existencia, precios, comparación, disponibilidad, recomendaciones
  basadas en esos datos). No es un asistente de propósito general.
- **Guardrail — dos etapas** (decisión acordada con el usuario):
  1. **Clasificador de input, antes del agente principal**: cada mensaje del
     usuario pasa primero por un paso de moderación (una llamada a LLM o un
     clasificador dedicado) que decide si el mensaje está dentro de alcance
     (perfumes/precios) o no. Si no lo está, se responde con un mensaje de
     rechazo fijo y **el mensaje nunca llega al agente con herramientas MCP** —
     el filtro corta antes, no después.
  2. **System prompt del agente principal**: además del filtro previo, el agente
     que sí recibe mensajes dentro de alcance tiene un system prompt estricto que
     lo limita a responder usando los datos que le devuelven las tools MCP (no
     inventar precios/disponibilidad) y a rechazar instrucciones que intenten
     hacerlo salir de ese rol (jailbreaks, "ignora tus instrucciones", etc.),
     como segunda capa de defensa si algo pasa el clasificador.
- El chatbot no requiere que el usuario esté autenticado para esta fase — responde
  sobre datos públicos de precios/catálogo, no sobre favoritos personales de un
  usuario (eso es explícitamente fuera de alcance, ver §9).

## 7. Estándares de calidad (documentación y testing)

No se repiten acá en detalle porque ya están fijados a nivel de proyecto en
`CLAUDE.md` y se aplican sin excepción a todos los componentes de este documento:

- Cada módulo ejecutable tiene tests unitarios; se agregan tests de integración
  solo cuando la feature lo amerita, según el scope gate de la `testing` skill.
  El testing de una feature usa su `specs/<feature-slug>.md` (y, en última
  instancia, este documento) como fuente de verdad — no el código ya escrito.
  Implementación y testing de una misma feature son sesiones separadas.
- Documentación de decisiones no obvias vive en `NOTES.md` por módulo o en
  `docs/` para decisiones cross-módulo — nunca para restablecer lo que el código
  ya deja claro.

## 8. Escala: muestra de prueba vs. producción

- Para esta fase, la lista de vendors y el catálogo de fragancias se mantienen
  chicos a propósito, para que correr los workers durante desarrollo/testing sea
  rápido. Los números concretos no son parte de este spec (son un detalle
  operativo de los datos de prueba, no una regla de negocio).
- El diseño de matching, actualización in-place y estructura de jobs descrito en
  §4 es el que se pretende usar a escala real (todo el catálogo de Fragrantica,
  todos los vendors reconocidos del país) — la muestra chica no debe traducirse
  en atajos de diseño (p.ej. no asumir que "nunca hay más de N fragancias" en
  ninguna parte del modelo).
- Las optimizaciones de escala explícitamente diferidas por el usuario son: delta
  search en el job semanal (§4.1) y mejoras al matching/búsqueda del job diario
  (§4.2). Quedan anotadas acá para que no se pierdan, no para resolverlas ahora.

## 9. Fuera de alcance

- Multi-país / multi-moneda.
- Historial de precios, tendencias, alertas de "bajó de precio".
- Marketplace/checkout: no hay carrito ni pago, solo se deriva al sitio del vendor.
- Autenticación o portal para vendors (los vendors no son actores del sistema, son
  datos gestionados por el admin).
- Actualizaciones de precio en tiempo real o con cadencia distinta a diaria.
- Escritura/acciones vía chatbot (favoritos, cuentas, etc. por conversación) —
  el MCP del chatbot es solo lectura en esta fase.
- Favoritos personalizados dentro del chatbot (requeriría autenticar la sesión de
  chat y pasar identidad de usuario al MCP; no está resuelto ni es necesario para
  el alcance actual).
- Recomendaciones basadas en un motor de personalización/ML — lo que el chatbot
  "recomienda" se limita a responder con los datos de precio/disponibilidad que
  expone el MCP.
- Infraestructura de despliegue (hosting, orquestación de los jobs, CI/CD): se
  define al final del proyecto, según lo acordado con el usuario — este documento
  no la fija.
- Optimización de delta-search (job semanal) y de matching (job diario): se
  explorarán después, quedan solo anotadas en §8.
