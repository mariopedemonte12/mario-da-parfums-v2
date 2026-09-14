# fragrance-catalog — `/fragrances` (artboard 1e)

## Contexto

Reemplaza la página de catálogo placeholder (`app/fragrances/page.tsx` y
`features/fragrances/components/{FragranceSearch,FragranceList,FragranceCard}.tsx`,
código previo al design system) por la implementación real del artboard
**1e** de `designGuidelines/Mario da Parfums.dc.html`: sidebar de filtros +
grilla de resultados, contra el contrato real de `GET /fragrances`
(`fragments-public-read`, ya mergeado).

Depende de `design-foundation` (fonts, `WindLines`, `lib/motion.ts`,
shadcn/ui) y `fragrances-public-read`, ambos ya mergeados. Ver
`frontend/FASE1.md` para el plan de fase y los recortes acordados de
antemano — no se reabren acá.

## Corrección de contrato encontrada durante la implementación

El brief original de esta tarea describía la respuesta de `GET /fragrances`
como `{ data: ResponseFragranceDto[], meta: { page, limit, total,
totalPages } }`. **Eso no es lo que hace el backend.**
`backend/src/fragrances/dto/paginated-fragrance.dto.ts` y
`fragrances.service.ts` (método `findAll`) devuelven un shape plano:

```ts
{ data: ResponseFragranceDto[], total: number, page: number, limit: number }
```

Sin `meta`, sin `totalPages`. Se verificó que este es el patrón vigente en
**todos** los módulos paginados del backend (`listings`, `users`,
`vendors`), no una inconsistencia aislada de `fragrances` — así que se
tomó como el contrato real a implementar, no como algo a corregir en el
backend desde esta feature de frontend. Se confirmó con el usuario antes de
proceder.

**Consecuencia**: el frontend tipa la respuesta como el shape plano real
(`PaginatedFragranceResponse` en `fragrance.types.ts`) y calcula
`totalPages = Math.ceil(total / limit)` client-side para la paginación, en
vez de leerlo de la respuesta.

## Filtros en alcance

Soportados hoy por `FindFragranceDto`, todos exact-match salvo `name`:

- **Nombre** — `name`, contains, case-insensitive. Input pill-shape en el
  header de la página (posición del buscador del mock 1e), debounced.
- **Marca** — `brand`, match exacto. Input pill-shape en el sidebar (texto
  libre — no hay endpoint de lista de marcas).
- **Concentración** — `concentration`, match exacto. Chips pill-shape en el
  sidebar, un solo valor activo a la vez (click de nuevo lo deselecciona).
- **Audiencia objetivo** — `targetAudience`, match exacto. Mismo patrón de
  chips.
- **Duración** — `longevity`, match exacto. Mismo patrón de chips.

### Actualización (post-implementación inicial): activación de concentration/targetAudience/longevity

El recorte v1 original asumía que estos tres campos no tenían dato útil
poblado (`fragrance-notes-enrichment` no había aterrizado). Se confirmó que
sí lo tienen — se activaron como filtros funcionales, ya acordado con el
usuario. Valores distintos observados en el dataset actual al momento de
implementar (snapshot, no un enum reforzado por el backend — ver comentario
en `fragrance.schema.ts`):

- `concentration`: 9 valores (Eau de Toilette, Eau de Parfum, Parfum,
  Extrait de Parfum, Eau de Cologne, Attar, Concentrate, Oil,
  Alcohol-Free).
- `targetAudience`: 3 valores (Male, Female, Unisex).
- `longevity`: 6 valores (Light, Light-Medium, Medium, Medium-Strong,
  Strong, Very Strong).

Al ser vocabularios chicos y cerrados en la práctica, se implementaron como
chips pill-shape de valores fijos (hardcodeados en
`FragranceFilters.tsx`, snapshot del dataset — no hay endpoint de valores
distintos), no como input de texto libre (a diferencia de `brand`, que sí
es abierto). **Riesgo conocido**: si el dataset gana valores nuevos para
estos campos, los chips no los reflejan hasta que alguien actualice la
constante a mano — aceptado como limitación de v1, no bloqueante.

`olfactoryFamily` (sección "Familia" del mock) queda **fuera de esta
activación**: tiene 145 valores distintos en el dataset actual, demasiados
para chips sin un patrón de búsqueda/typeahead — sigue **deshabilitada con
"Próximamente"**, sin datos simulados ni interacción, igual que antes. No
hay más secciones "Próximamente" en el sidebar además de esta — el mock
original tenía tres (Familia, Momento, Intensidad); "Momento" no
correspondía a ningún campo real del DTO y se reemplazó por las tres
secciones activas de arriba.

## Precio — decisión acordada: omitir en v1

El mock (1e) incluye un slider de precio en el sidebar. Se omite
completamente en esta implementación:

- El precio vive en `listings`, no en `fragrances` — `GET /fragrances` no
  lo expone ni permite filtrar por él, así que un slider global no tiene
  backing real.
- Un "desde $X" por card requeriría una llamada extra a
  `GET /listings?fragranceId=:id` por cada fragancia visible — N+1 en una
  grilla de catálogo (hasta `limit` filas visibles a la vez, hasta 100).
  No se justifica el costo para v1.
- **Decisión**: se deja para cuando exista un endpoint de catálogo que
  resuelva el precio server-side (ej. un `GET /fragrances` enriquecido, o
  un endpoint de catálogo dedicado en `listings`). No está en el alcance de
  esta feature reabrir esa decisión de backend.

## Comportamiento

- Ruta: `/fragrances`. Navbar/Footer globales (`app/layout.tsx`) — la
  página solo compone el contenido bajo el nav, como el resto de las rutas.
- Header: título "Todos los perfumes" + contador de resultados (`total`
  real de la respuesta, no un valor fijo como en el mock) + buscador por
  nombre.
- Sidebar (`aside`, 220px como el mock):
  - Filtro de marca: input pill-shape, texto libre, match exacto contra
    `brand`. No hay endpoint de "lista de marcas" — es un input de texto,
    no un select ni checkboxes por marca.
  - Secciones "Familia", "Momento", "Intensidad": presentes visualmente
    (mismo layout/tipografía que el mock) pero deshabilitadas, con
    "Próximamente" en vez de opciones reales.
  - Sin sección de precio (ver arriba).
- Grid: 4 columnas en desktop (mock), responsive a menos columnas en
  breakpoints menores — el mock es desktop-only, se adapta el grid con
  Tailwind (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` o similar) sin
  artboard mobile dedicado para 1e.
- Cada card es un link a `/fragrances/[id]` (ruta que implementa
  `fragrance-detail` en paralelo) — sin eso, una card en una grilla de
  catálogo no tendría ninguna interacción.
- Cada card reutiliza el placeholder de botella diagonal-striped
  (`repeating-linear-gradient`) del mock — no se inventa otro tratamiento
  visual ni se usa `imageUrl` todavía (fuera de alcance: esta feature no
  agrega manejo de imágenes reales, se implementa cuando se decida
  consumir `imageUrl`). Debajo de la botella: nombre (serif) y marca (en
  vez de "notas"/precio del mock, que no aplican aquí — ver recortes).
- Paginación: controles a partir de `page`/`limit` enviados y
  `totalPages` calculado (ver corrección de contrato arriba). Cambiar de
  página no resetea los filtros activos.
- Estados: loading, error (fetch falla), vacío (sin resultados para los
  filtros activos) — copy en español, tono del proyecto.
- **Transición de página (acordado post-implementación inicial)**: al
  cambiar de página, las cards de la página anterior salen (fade +
  deslizamiento hacia la izquierda) mientras las de la nueva página entran
  (fade + deslizamiento desde la derecha, con stagger), leyéndose como el
  viento llevándose las anteriores y trayendo las nuevas — reutiliza el
  patrón "emerge" ya definido en `lib/motion.ts` (mismo look que la
  entrada de resultados de búsqueda en otras pantallas), agregándole un
  estado `exit` en la dirección opuesta. Implementado vía
  `AnimatePresence` (`mode="popLayout"`) en `FragranceList.tsx` +
  `motion.li` en `FragranceCard.tsx`; respeta `prefers-reduced-motion`
  (`MotionConfig reducedMotion="user"`). El grid (`motion.ul`) lleva
  `position: relative` — requisito de `popLayout`, que saca del flujo
  (`position: absolute`) a las cards salientes; sin un ancestro
  posicionado más cercano, terminan ancladas a otro ancestro y aparecen
  desubicadas.

  **Causa raíz real del overflow** (diagnosticada con Playwright,
  `page.evaluate` + inspección de `getComputedStyle`/`data-motion-pop-id`):
  no era solo el `position: relative` del grid. `AnimatePresence` con
  `popLayout` necesita un `ref` directo al nodo DOM de cada card saliente
  para medirlo y fijarlo en `position: absolute` durante la salida
  (mecanismo interno de `framer-motion`: `PopChild` inyecta un
  `<style>` con `[data-motion-pop-id="..."] { position: absolute !important; ... }`
  basado en una medición por `ref`). Como `FragranceCard` era un
  componente función plano que no reenviaba su `ref` al `motion.li`
  interno, el `ref` que `AnimatePresence` intenta adjuntar no llegaba a
  ningún nodo real — la medición fallaba silenciosamente (width/height en
  0) y el mecanismo de `popLayout` no hacía nada: las 20 cards salientes y
  las 20 entrantes coexistían en flujo normal (`position: static`) durante
  la transición, duplicando la altura del grid (`scrollHeight` pasaba de
  ~2084px a ~3861px) — de ahí el "aparecen iconos abajo". Fix: `FragranceCard`
  acepta y reenvía `ref` a su `motion.li` (patrón de React 19, `ref` como
  prop normal, sin `forwardRef`). **Nota general para cualquier uso futuro
  de `AnimatePresence` en este código base**: el hijo directo de
  `AnimatePresence` debe ser el propio componente `motion.*`, o un
  wrapper que reenvíe `ref` explícitamente — envolver en un componente
  función que no reenvía `ref` rompe `mode="popLayout"` sin ningún error
  en consola.

  Al cambiar de página también hace scroll suave hasta el inicio de los
  resultados (`scrollIntoView` sobre el `<h1>`, disparado desde
  `handlePageChange` en `page.tsx`) — sin esto el usuario quedaba
  scrolleado en la posición del control de paginación mientras la
  animación ocurría fuera de vista.

## Fuera de alcance

- Carrito/checkout: no existe en la plataforma (confirmado en
  `FASE1.md`/`platform-spec.md`). El contador +/- de "cantidad" del
  `FragranceCard` placeholder es código muerto de un flujo que nunca
  existió — se elimina, no se reemplaza por nada.
- Filtro por familia olfativa funcional (ver "Actualización" arriba — sigue
  "Próximamente", 145 valores distintos sin patrón de búsqueda todavía).
- Precio/"desde $X" por card (ver arriba).
- Manejo de `imageUrl` real (se sigue usando el placeholder de botella).
- Ordenamiento de resultados (no pedido, no hay control en el mock 1e).

## Riesgo de merge conocido

`fragrance-detail` (worktree en paralelo) toca los mismos archivos
compartidos de `features/fragrances/` (`api`, `types`). Cambios acotados a
lo que esta feature necesita — no se tocan partes del archivo que no
correspondan a `/fragrances`.
