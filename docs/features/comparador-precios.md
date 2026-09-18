# Comparador de precios

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Los precios comparados son **simulados** (ver [`../requirements.md`](../requirements.md)).

## Problema

Quien quiere comprar un perfume necesita ver de un vistazo en qué tiendas está, a qué precio, en qué tamaño y si hay stock.

## Solución

En la página de detalle de cada perfume (`/fragrances/[id]`) se muestra una tabla de ofertas ("listings") de todas las tiendas, ordenable por precio y filtrable por disponibilidad y por tienda. Al elegir una oferta, el botón de compra enlaza a la URL de esa tienda.

## Funcionamiento

- **Datos**: tabla `listings` (`fragranceId`, `vendorId`, `sizeMl`, `price` entero en CLP, `url`, `inStock`, `scrapedAt`) con índice único `(vendorId, fragranceId, sizeMl)` ([`schema`](../../backend/src/database/schema/listing.schema.ts)). Los llena [`priceGenerator`](../../priceGenerator) con datos simulados.
- **API**: `GET /listings` público con filtros `fragranceId`, `vendorId`, `inStock`, `minPrice`, `maxPrice` y paginación por cursor numérico ([`listings.service.ts`](../../backend/src/listings/listings.service.ts)). El frontend pide `fragranceId` con `limit=20` ([`listings.api.ts`](../../frontend/src/features/listings/api/listings.api.ts)) y `GET /vendors` para los nombres.
- **UI**: [`ListingsPriceTable.tsx`](../../frontend/src/features/listings/components/ListingsPriceTable.tsx): ordena asc/desc por precio **en el cliente**, filtra "Solo disponibles" y por tienda, y preselecciona la oferta de menor precio visible. El botón de [`FragranceHero.tsx`](../../frontend/src/features/fragrances/components/FragranceHero.tsx) abre `selectedListing.url` en una pestaña nueva.
- **Más barato vía chatbot**: la tool MCP `get_cheapest_listing` (backend) elige el listing disponible de menor precio entre hasta 100 listings de un perfume.

## Decisiones

- Solo se guarda el precio vigente, sin historial; una fila por `(vendor, perfume, tamaño)`.
- `price` es `integer` (CLP no usa decimales en la práctica).
- La comparación se calcula en el cliente y en la tool MCP, no en un endpoint de "mejor precio" del backend.

## Limitaciones

- Precios, tiendas y URLs son inventados; las URLs apuntan a dominios `.example.com` que no existen.
- `GET /fragrances` no devuelve precios: el listado del catálogo no muestra "mejor precio" por perfume. (`platform-spec.md` §5.3 lo prometía.)
- El frontend solo pide la primera página (20 listings) de un perfume. Con 5 tiendas y un listing por par no se nota, pero no está paginado en la UI. > TODO(verificar): comportamiento en la UI si hubiera más de 20 listings.
- Sin historial, tendencias ni alertas de precio.
