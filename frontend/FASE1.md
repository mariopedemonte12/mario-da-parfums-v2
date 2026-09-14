# Fase 1 — features en paralelo (frontend)

Plan de trabajo acordado para construir el frontend contra los mockups de
`designGuidelines/Mario da Parfums.dc.html` (ver `frontend/CLAUDE.md`,
sección "Visual reference — mockups are mandatory", para el lenguaje de
diseño y la tabla de pantallas canónicas).

## Prerrequisito

Todo lo de acá depende de que la **Fase 0** esté mergeada:

- `fragrances-public-read` (backend) — `GET /fragrances` y `GET /fragrances/:id`
  públicos, necesarios para catálogo/detalle/búsqueda.
- `design-foundation` (frontend) — fonts (Cormorant Garamond + Jost), shadcn/ui
  + `cn()`, `WindLines`, `lib/motion.ts`, Navbar/Footer restyleados a 1a.
  **Bloqueante duro**: todas las tareas de abajo importan de acá.
- `fragrance-notes-enrichment` (perfumeCatalogImporter + backend) — **no
  bloqueante**, pero si aterriza antes, `fragrance-catalog` y
  `fragrance-detail` pueden implementar filtros reales de familia
  olfativa/intensidad en vez del recorte v1 descrito abajo.

## Tareas (6, paralelizables entre sí una vez lista la Fase 0)

| Worktree | Ruta(s) | Artboard(s) | Depende de | Spec | Alcance / recortes v1 |
|---|---|---|---|---|---|
| `home-search` | `/` (hero + estado de resultados) | 1a, 1c, 1i (móvil = mismo componente en breakpoint) | `fragrances-public-read`, `design-foundation` | sí | Búsqueda llama a `GET /search` (servicio semántico, `queryApi`), resuelve cada resultado contra `GET /fragrances?name=` para nombre/marca/descripción/imagen. "Afinidad %" = `score` real de `/search`. Estado vacío/error del buscador. |
| `fragrance-catalog` | `/fragrances` | 1e | `fragrances-public-read`, `design-foundation` | sí | Filtros reales: nombre (contains), marca (exact). Sin familia/momento/intensidad hasta que `fragrance-notes-enrichment` aterrice (no hay dato hoy) — no simular esas secciones del sidebar. Precio: sin slider global (el precio vive en `listings`, no en `fragrances`); si se quiere un "desde $X" por card, requiere una llamada extra a `listings` por fragancia — decidir si vale la pena para v1 o se deja para cuando exista un endpoint de catálogo con precio ya resuelto. |
| `fragrance-detail` | `/fragrances/[id]` | 1f | `fragrances-public-read`, `design-foundation` | sí | Pirámide salida/corazón/fondo → se muestra `description` como bloque único (no hay notas estructuradas en ningún lado del proyecto). Tabla de precios real: `GET /listings?fragranceId=:id` + `GET /vendors`, join client-side, ordenable por precio, filtrable por `inStock`/vendor. El botón "Añadir" del mock no aplica (no existe carrito/checkout en la plataforma) — se reemplaza por "Ver en tienda" al `url` del listing elegido. |
| `chatbot-widget` | widget flotante en todas las rutas | 1d | `design-foundation` | sí | Panel + mascota "Sensei" (idle breathing, typing dots). `lib/ws/client.ts` nuevo, protocolo en `specs/chatbot-server.md`. Sin auth (el chatbot no requiere login, `platform-spec.md` §6). Conectar el websocket de forma perezosa (al abrir el panel), no en cada carga de página. |
| `user-profile` | `/profile` | 1g | `fragrances-public-read`, `design-foundation`, auth funcionando | sí | Sin "estela %" (no hay notas estructuradas para calcularlo) ni "pedidos entregados"/"perfume más buscado" (no existe módulo de pedidos ni tracking de búsquedas). Se muestra: datos de usuario (`GET /users/:id`, self-or-admin) + guardados reales (`GET /favorites`, requiere JWT). |
| `auth-pages` | `/login`, `/register` | 1h | `design-foundation` | sí | Backend ya tiene `POST /auths/login` — falta `login()` en `features/auth/api/auth.api.ts` y completar `useAuth.tsx` (hoy vacío). La sesión debe decidir y documentar la estrategia de guardado del token (localStorage vs. cookie) — el backend hoy devuelve el `accessToken` en el body, no vía `Set-Cookie`. |

## Riesgos de merge conocidos

- `fragrance-catalog` y `fragrance-detail` comparten `features/fragrances/`
  (api/types/hooks) — no se bloquean entre sí, pero al fusionar ambas puede
  haber un conflicto chico en `fragrances.api.ts`/`fragrances.types.ts` si
  las dos agregan campos o funciones en la misma zona del archivo.
- Todas las tareas consumen `components/ui/` y `lib/motion.ts` de
  `design-foundation` — si alguna necesita un primitivo de shadcn que
  `design-foundation` no instaló (ej. `Slider`, `Tabs`), agregarlo ahí mismo
  con `npx shadcn@latest add <componente>` en vez de reinventarlo.

## Al terminar cada tarea

Mismo criterio que Fase 0: no borrar el worktree, no mergear/abrir PR salvo
que se pida explícitamente, dejar el trabajo listo para handoff. La sesión
que **prueba** cada feature contra su spec es una sesión distinta (ver
CLAUDE.md raíz, "Implementation and testing are separate sessions").
