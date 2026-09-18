# Administración y generación de datos

> **Estado: Borrador — pendiente de confirmar contra infra final.**

## Problema

El sistema necesita datos (perfumes, tiendas, precios) y una vía de gestión, sin scraping real ([`../requirements.md`](../requirements.md)).

## Solución

- **CRUD administrativo** en el backend, en lote y con éxito parcial por ítem (respuesta por elemento), para perfumes, vendors, listings y usuarios. Lecturas públicas (usuarios: ver controlador); mutaciones con `JwtAuthGuard` + `RolesGuard` (`ADMIN`).
- **Carga de catálogo**: CLI [`perfumeCatalogImporter/main.py`](../../perfumeCatalogImporter/main.py): lee el CSV de Kaggle ([`dataset_source.py`](../../perfumeCatalogImporter/dataset_source.py): normaliza mayúsculas, concentración, público, longevidad y descarta la fila de encabezado duplicada), genera descripción sintética y hace upsert `ON CONFLICT (name, brand)`. Descarta filas sin nombre/marca y registra como fallo una colisión `(brand, name)` dentro de la misma corrida.
- **Carga de precios**: CLI [`priceGenerator/main.py`](../../priceGenerator/main.py): asegura 5 vendors ficticios y hace upsert de un listing por par perfume-vendor (reglas en [`../design-decisions.md`](../design-decisions.md#5-scraping-simulado)); termina con código 1 si algún upsert falló.

## Funcionamiento

Ambos CLI hacen un commit por ítem y aíslan fallos individuales; ambos usan SQL parametrizado con `psycopg2` y leen `DATABASE_URL`. El dataset CSV **no está versionado**: se descarga con `download_dataset.py` (requiere credenciales de Kaggle).

## Decisiones

Scripts batch a mano, sin scheduler; escritura directa a Postgres; determinismo para reproducibilidad.

## Limitaciones

- Los scripts Python replican los nombres de columna del esquema Drizzle; un cambio de esquema exige actualizarlos.
- Sin ejecución programada. > TODO(verificar): cómo se orquestan en la infra final.
- Hay 8 pares `(brand, name)` duplicados en el dataset con datos distintos; solo el primero se conserva ([`NOTES.md`](../../perfumeCatalogImporter/NOTES.md); cifra reportada allí, no re-verificada).
