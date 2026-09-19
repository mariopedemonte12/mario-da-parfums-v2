# fragrance-detail — página de detalle de perfume (`/fragrances/[id]`)

## Contexto

Parte de la Fase 1 descrita en `frontend/FASE1.md`. Implementa el artboard
**1f** de `designGuidelines/Mario da Parfums.dc.html` ("Detalle de perfume").
Depende de `fragrances-public-read` (`GET /fragrances/:id`, ya mergeado),
`listings-crud` (`GET /listings`, ya mergeado) y `vendors-crud` (`GET
/vendors`, ya mergeado) — todos ya expuestos por `backend/`, esta feature es
puramente frontend, sin cambios de API.

Comparte `features/fragrances/` (api/types/hooks) con `fragrance-catalog`,
que se está construyendo en paralelo — ver "Riesgo de merge conocido" en
`frontend/FASE1.md`. Esta feature solo **agrega** lo que necesita a
`fragrance.types.ts`/`fragrances.api.ts`, no reescribe lo existente.

## Ruta y datos

`/fragrances/[id]`, `id` = uuid de la fragancia (param de ruta).

| Fuente | Uso |
|---|---|
| `GET /fragrances/:id` → `ResponseFragranceDto` | Datos de la fragancia (nombre, marca, concentración, descripción, imagen, familia olfativa, público objetivo, longevidad). 404 si no existe. |
| `GET /listings?fragranceId=<id>&limit=100` → `PaginatedListingsDto` | Todos los listings (precio/tamaño/stock/url por vendor) de esta fragancia. |
| `GET /vendors?limit=100` → `PaginatedVendorsDto` | Catálogo completo de vendors, para resolver `listing.vendorId → vendor.name` client-side (no se llama `/vendors/:id` por listing). |

Listings y vendors se piden con `limit=100` para evitar paginar de más en el
caso común, pero el cliente respeta `meta.totalPages`: si hay más de una
página, se piden las páginas siguientes y se concatenan antes de renderizar
— no se asume que 100 siempre alcanza. Todo el filtrado/ordenamiento de la
tabla de precios (ver abajo) es client-side sobre ese conjunto ya completo;
no se vuelve a pedir al backend por cada cambio de filtro.

## Comportamiento

1. **Carga**: mientras se resuelve `GET /fragrances/:id`, estado de carga
   (mismo patrón que `/fragrances`: texto "Cargando...").
2. **404 / fragancia inexistente**: la UI lo maneja explícitamente (no deja
   propagar un error genérico) — mensaje "No encontramos este perfume" +
   link de vuelta a `/fragrances`. No es un estado de error de red.
3. **Cambio de id**: al navegar a otro perfume nunca se muestran los datos
   del anterior: durante la carga y si la nueva petición falla, no hay
   fragancia.
3b. **Error de red** (fragancia, listings o vendors): mensaje de error
   separado del 404, tono consistente con el resto del sitio
   ("No pudimos cargar ...").
4. **Fragancia encontrada, sin listings**: se muestra igual la fragancia
   (imagen, nombre, descripción); la tabla de precios muestra un estado
   vacío ("Todavía no tenemos precios para este perfume") y el botón "Ver
   en tienda" queda deshabilitado (no hay `url` a la cual abrir).
5. **Selección de listing**: existe un listing "con foco" en todo momento
   que haya al menos un listing visible en la tabla (tras filtros) — el
   foco es siempre **el primer listing de la tabla tal como está ordenada y
   filtrada en ese momento** (`sorted[0]`), sin preferencia por
   disponibilidad: si el más barato (o el más caro, bajo sort descendente)
   está agotado, igual queda con foco por defecto — no se busca el primero
   disponible. Por defecto la tabla arranca ordenada por precio ascendente.
   Click en una fila cambia el foco; reordenar la tabla no lo cambia por sí
   solo (solo se recalcula si el foco actual deja de estar visible). Si el
   listing con foco queda oculto por un filtro, el foco pasa al nuevo primer
   listing según el orden vigente en ese momento; si ningún listing queda
   visible, no hay foco y el botón se deshabilita.
6. **"Ver en tienda"**: abre `listing.url` del listing con foco en una
   pestaña nueva (`target="_blank"`, `rel="noopener noreferrer"`). No hay
   carrito ni checkout — reemplaza al botón "Añadir" del mock.
7. **Tabla de precios**: columnas vendor (join client-side por
   `listing.vendorId`), tamaño (`sizeMl`), precio (`price`, formateado como
   CLP), disponibilidad (`inStock`). Ordenable por precio (asc/desc,
   toggle). Filtrable por disponibilidad (`inStock`) y por vendor
   (dropdown poblado con los vendors presentes en los listings de esta
   fragancia). Sin paginación en la tabla — se listan todos los listings
   cargados (recorte v1: no se esperan volúmenes grandes por fragancia).

## Recortes v1 (acordados en `frontend/FASE1.md`)

- **Pirámide olfativa** (salida/corazón/fondo) del mock → se reemplaza por
  `description` como bloque de texto único. No existe ese dato estructurado
  en ningún lugar del proyecto (backend, similarityServer).
- **Precio único + botón "Añadir"** del mock → tabla de precios real
  (múltiples vendors/tamaños) + botón "Ver en tienda" que abre el listing
  con foco. No hay carrito/checkout en la plataforma.
- Los renglones "Duración 8h · Estela moderada" del mock (hardcodeados) se
  reemplazan por los campos reales que sí existen en `ResponseFragranceDto`
  (`longevity`, `targetAudience`) cuando no son `null`; si son `null`, no se
  muestran (no se inventa contenido).

## Fuera de alcance

- Favoritos/guardado desde esta página (pertenece a `favorite-module` /
  `/profile`, no a esta feature).
- Filtro de familia olfativa/intensidad (depende de
  `fragrance-notes-enrichment`, no bloqueante para esta feature).
- Cualquier mutación (crear/editar/borrar fragancia, listing o vendor) —
  esta página es de solo lectura.
- SEO/metadata dinámica (`generateMetadata`) — no pedido, no se implementa
  en v1.
