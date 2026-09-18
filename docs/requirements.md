# Requisitos y alcance

> **Estado: Borrador — pendiente de confirmar contra infra final.**
> Verificado contra el código de la rama base (`dd1b03f`). Reemplaza, para efectos de evaluación externa, las secciones desactualizadas de [`platform-spec.md`](../platform-spec.md) (ver [Relación con `platform-spec.md`](#relación-con-platform-specmd)).

## Propósito

Mario da Parfums es una plataforma web que **compara precios de perfumes en Chile (CLP)**: para cada perfume del catálogo muestra en qué tiendas ("vendors") está y a qué precio, y enlaza al sitio de la tienda. No vende perfumes ni procesa pagos.

Es un proyecto de aprendizaje y experimentación técnica (ver [`purpose.md`](purpose.md)).

## Aviso importante: los datos de precios y tiendas son simulados

**El sistema NO hace scraping de sitios externos.** Se decidió *simular* la extracción para evitar los problemas legales y contractuales de la extracción automatizada de sitios de terceros (Fragrantica para el catálogo, retailers chilenos para los precios). Concretamente:

- **Precios y tiendas**: los genera el script `priceGenerator/` de forma determinística (semilla derivada de `sha256(fragranceId:vendorId)`). Las 5 tiendas son ficticias, con dominios `.example.com` ([`priceGenerator/vendor_catalog.py`](../priceGenerator/vendor_catalog.py)); las URLs de producto también son inventadas ([`priceGenerator/price_generator.py`](../priceGenerator/price_generator.py), `build_listing_url`). Ningún precio corresponde a una oferta real.
- **Catálogo de perfumes**: se carga desde un dataset estático de Kaggle ("Perfume Dataset", CC BY 4.0, ver [`perfumeCatalogImporter/data/README.md`](../perfumeCatalogImporter/data/README.md)). Las marcas y nombres son reales; **las descripciones son 100 % inventadas por el proyecto** a partir de plantillas ([`perfumeCatalogImporter/description_generator.py`](../perfumeCatalogImporter/description_generator.py)). No hay imágenes (`image_url` queda nulo).

El código de un scraper real de Fragrantica existió en una versión anterior (`fragranticaScraper/`) y fue reemplazado; permanece solo en el historial de git ([`perfumeCatalogImporter/CLAUDE.md`](../perfumeCatalogImporter/CLAUDE.md)). Ver la decisión completa en [`design-decisions.md`](design-decisions.md#5-scraping-simulado).

## Funcionalidades implementadas

Verificadas en el código (no solo en specs):

| Funcionalidad | Dónde vive | Detalle |
|---|---|---|
| Catálogo de perfumes con filtros y paginación por cursor | backend `GET /fragrances`, frontend `/fragrances` | [features/catalogo-y-detalle.md](features/catalogo-y-detalle.md) |
| Comparador de precios por perfume | frontend `/fragrances/[id]` + backend `GET /listings?fragranceId=` | [features/comparador-precios.md](features/comparador-precios.md) |
| Búsqueda textual | backend `GET /fragrances` (`name`; `search` en curso) | [features/busqueda-textual.md](features/busqueda-textual.md) |
| Búsqueda semántica por descripción libre | `similarityServer` (`GET /search`), frontend `/` | [features/busqueda-semantica.md](features/busqueda-semantica.md) |
| Chatbot conversacional ("Sensei") con tool calling | `chatbot/` (WebSocket) + widget frontend | [features/chatbot.md](features/chatbot.md) |
| Cuentas de usuario, sesión por cookie JWT, roles `USER`/`ADMIN` | backend `/auths`, `/users` | [features/cuentas-y-favoritos.md](features/cuentas-y-favoritos.md) |
| Favoritos y perfil | backend `/favorites`, frontend `/profile` | [features/cuentas-y-favoritos.md](features/cuentas-y-favoritos.md) |
| CRUD admin (batch, éxito parcial) de perfumes, vendors, listings, usuarios | backend | [features/administracion-y-datos.md](features/administracion-y-datos.md) |
| Generación de datos simulados (catálogo, precios) | `perfumeCatalogImporter/`, `priceGenerator/` | [features/administracion-y-datos.md](features/administracion-y-datos.md) |
| Servidor MCP de solo lectura sobre el catálogo | backend `POST /mcp` | [features/chatbot.md](features/chatbot.md) |
| Páginas legales (términos/privacidad) | frontend `/terminos` | — |
| Endurecimiento básico de seguridad (helmet, rate limit global 100/min y 5/min en login/registro, límite de body 256 kb, cookie httpOnly) | backend [`main.ts`](../backend/src/main.ts), [`app.module.ts`](../backend/src/app.module.ts) | ver [`specs/security-hardening.md`](../specs/security-hardening.md) |

## Alcance

- **Geografía y moneda**: Chile, CLP, entero, fijo.
- **Datos de demostración**: ~1.000 perfumes reales (marca/nombre) del dataset de Kaggle y 5 tiendas ficticias; cada par perfume-tienda tiene exactamente un `Listing` con un tamaño en ml derivado del precio.
- **Modelo de `Listing`**: una fila por `(fragrance, vendor, sizeMl)` (índice único), con `price`, `url`, `inStock`, `scrapedAt` ([`backend/src/database/schema/listing.schema.ts`](../backend/src/database/schema/listing.schema.ts)). Solo se guarda el precio vigente, sin historial.
- **Acceso**: lectura pública (perfumes, tiendas, listings, búsqueda, chatbot); favoritos requieren cuenta; mutaciones administrativas requieren rol `ADMIN`.

## Fuera de alcance

- Scraping real de cualquier sitio externo (decisión deliberada, ver arriba).
- Compra, carrito, pagos, checkout.
- Multi-país / multi-moneda.
- Historial de precios, tendencias, alertas de "bajó de precio".
- Ejecución programada de jobs: ni el importador ni el generador de precios tienen scheduler; son scripts batch que se lanzan a mano ([`priceGenerator/main.py`](../priceGenerator/main.py)). > TODO(verificar): si la infra final agrega algún scheduler o cron en compose.
- Portal para vendors: los vendors son datos gestionados por un admin.
- Personalización del chatbot con la identidad del usuario (el chat no está autenticado ni conoce los favoritos).
- Escritura por chat (el chatbot solo tiene tools de lectura).
- Imágenes reales de perfumes (el dataset no las incluye).

## Relación con `platform-spec.md`

[`platform-spec.md`](../platform-spec.md) sigue siendo el documento de intención de producto, pero **contiene secciones que ya no describen el sistema real**. Este documento (`docs/requirements.md`) lo reemplaza como descripción de lo implementado. Las divergencias verificadas están anotadas en un aviso al inicio de `platform-spec.md`; las principales:

1. §2 y §4.1 hablan de un "worker de catálogo" semanal que scrapea Fragrantica: hoy es un importador CLI bajo demanda desde un CSV de Kaggle.
2. §3/§4.2 nombran el flag `isAvailable`; en el esquema real se llama `inStock` (el servidor MCP lo re-expone como `isAvailable`).
3. §4.2 describe matching por vendor, reintentos y delisting; el generador simulado no hace nada de eso (genera precio, tamaño y stock de forma determinística).
4. §5.3 promete "buscar fragancias con su mejor precio actual" y "vendor más barato": `GET /fragrances` **no** devuelve precios; el más barato solo existe como tool MCP (`get_cheapest_listing`) y el frontend ordena los listings en el cliente.
5. §4.1 dice que el backend consultaría al servicio de similitud por HTTP; en realidad **es el frontend** quien lo llama directamente y el backend nunca lo consume.
6. §9 declara fuera de alcance las "recomendaciones basadas en ML"; existe búsqueda semántica por embeddings (contenido, no personalizada) y el chatbot puede usarla si se configura su servidor MCP.

> TODO(verificar): estado final de estas secciones una vez cerrada la infra.
