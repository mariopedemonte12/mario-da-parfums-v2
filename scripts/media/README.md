# Material audiovisual (GIFs y capturas)

Scripts de Playwright que generan los GIFs y PNG de `docs/media/` (los referencia el README raiz). No contienen credenciales ni datos personales: solo navegan el frontend publico contra el stack local.

| Script | Salida |
|---|---|
| `record-comparador.mjs` | `docs/media/comparador.gif` (buscar `jean` -> detalle -> tabla de precios) |
| `record-busqueda-semantica.mjs` | `docs/media/busqueda-semantica.gif` (home: "perfumes frescos para verano" -> afinidad -> abrir uno) |
| `record-busqueda-parcial.mjs` | `docs/media/busqueda-parcial.gif` (`jean`, `gaultier`, `dior sauvage` en /fragrances) |
| `screenshots.mjs` | `docs/media/hero.png`, `docs/media/detalle.png` |
| `lib.mjs` | helpers: cursor falso, escritura lenta, grabacion, webm -> GIF |

`docs/media/chatbot.gif` no esta: requiere Gemini con cuota (ver "Chatbot" abajo).

## Como regenerar

1. Levanta el stack con `docker compose --profile seed up -d` (ver `docs/local-setup.md`) y espera a `healthy`. Si el puerto 3000 esta ocupado, exporta `BACKEND_HOST_PORT=13000 NEXT_PUBLIC_BACKEND_API_URL=http://localhost:13000` en cada comando `docker compose` (y reconstruye el frontend, porque `NEXT_PUBLIC_*` se hornea en el build).
2. Instala las herramientas localmente (nada global; `.media-run/` esta fuera de git):
   ```bash
   mkdir -p .media-run/tools && cd .media-run/tools
   npm init -y && npm i ffmpeg-static gifsicle playwright-core
   ```
   Usa un chromium de Playwright cuya revision coincida con `playwright-core` (`browsers.json`); si ya esta en `~/.cache/ms-playwright` no se descarga nada. Otra ubicacion: `MEDIA_TOOLS=/ruta`.
3. Desde la raiz del repo:
   ```bash
   node scripts/media/record-comparador.mjs
   node scripts/media/record-busqueda-semantica.mjs
   node scripts/media/record-busqueda-parcial.mjs
   node scripts/media/screenshots.mjs
   ```
   Variables opcionales: `FRONT_URL` (defecto `http://localhost:3010`) y `API_URL` (defecto `http://localhost:13000`).

Cada script graba un webm con `recordVideo` (viewport 1280x800), lo recorta al inicio de la interaccion y lo convierte a GIF con ffmpeg-static (`palettegen`/`paletteuse`, 11 fps, 880 px de ancho) y `gifsicle -O3 --lossy=60`. Imprime el peso y deja 6 fotogramas en `.media-run/rec/frames-*/` para revisarlos a ojo. Los tres GIFs pesan entre 2 y 3 MB; mantenlos bajo 6 MB (el historial de git es permanente).

## Chatbot

El GIF del chatbot requiere una clave de Gemini con cuota. Pregunta prevista, que encadena tools reales (`search_fragrances`, `search_similar_fragrances`, `get_cheapest_listing`, `present_fragrances`): "Quiero un perfume parecido a Sauvage EDP de Dior pero mas barato". Abre el widget con el boton "Sensei" de la barra, escribe en "Escribe al sensei..." y espera a las tarjetas; confirma las tools con `docker compose logs chatbot`.

## Requisitos de los datos

El dataset no incluye Chanel; usa marcas existentes (Jean Paul Gaultier, Dior).
