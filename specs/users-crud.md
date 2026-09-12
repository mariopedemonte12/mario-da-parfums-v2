# users — revisión de contrato mínimo

## Contexto

El módulo `users` existía como scaffold: DTOs y guards ya estaban escritos
(`CreateUserDto`, `UpdateUserDto`, `UserResponseDto`, `JwtAuthGuard`,
`RolesGuard`, `ResourceOwnerGuard`), pero `UsersService.findAll/findOne/
update/remove` eran stubs que devolvían strings — no tocaban la DB. El
controller además tenía dos problemas de contrato reales, no solo huecos de
implementación:

1. `CreateUserDto.passwordHash` esperaba que el **cliente** mandara el hash
   ya calculado — nunca debe pedirse un hash por API, el hashing es
   responsabilidad del servidor.
2. `UpdateUserDto = PartialType(CreateUserDto)` heredaba `role` y el campo
   de password. Un usuario autenticado podía hacer `PATCH /users/:id` sobre
   su propio id con `{ role: "admin" }` y auto-promoverse — escalación de
   privilegios.

Esta revisión cierra esos huecos y deja el módulo cumpliendo el contrato
mínimo acordado con el usuario (ver abajo), sin expandirlo a batch endpoints
(decisión explícita, ver "Fuera de alcance").

**Corrección posterior (acordada con el usuario)**: la primera versión de
esta revisión agregó `POST /users` para que el admin creara usuarios ahí
mismo. El usuario corrigió eso: crear una cuenta es trabajo de `auths`, no
de `users` — `users` administra cuentas que ya existen (leer, modificar,
borrar), no las crea. La capacidad de "admin crea usuarios" (incluyendo
crear otro admin) se movió a `POST /auths/admin-register`
(`AuthsService.adminCreate`), ver `auths/NOTES.md`. `users` se quedó sin
ningún endpoint de creación.

## Contrato mínimo (acordado con el usuario)

- **Admin** puede administrar usuarios: crear (vía `auths`, ver arriba),
  destruir y modificar cualquier usuario (estos dos últimos sí viven en
  `users`).
- **Un usuario autenticado** puede ver y modificar su **propio** perfil.
- Los guards (`JwtAuthGuard`, `RolesGuard`, `ResourceOwnerGuard`) ya
  existían y se reutilizan; se agrega `SelfOrAdminGuard` (nuevo, en
  `src/common/guards`) porque ninguno de los guards existentes expresaba
  "dueño del recurso **o** admin" — `ResourceOwnerGuard` solo permite al
  dueño, y Nest aplica los guards de una ruta en AND, no en OR, así que no
  se podía componer `RolesGuard` + `ResourceOwnerGuard` para lograr esto.

## Endpoints

`users` expone cuatro endpoints single-item (sin `POST` — ver arriba;
decisión explícita sobre batch vs. single-item más abajo):

| Method | Path          | Guard                                | Quién |
|--------|---------------|---------------------------------------|-------|
| GET    | `/users`      | `JwtAuthGuard` + `RolesGuard(ADMIN)`  | admin lista usuarios (filtros + paginación) |
| GET    | `/users/:id`  | `JwtAuthGuard` + `SelfOrAdminGuard`   | admin (cualquier id) o el propio usuario |
| PATCH  | `/users/:id`  | `JwtAuthGuard` + `SelfOrAdminGuard`   | admin (cualquier id) o el propio usuario |
| DELETE | `/users/:id`  | `JwtAuthGuard` + `RolesGuard(ADMIN)`  | solo admin |

La creación de cuentas vive en `auths`:

| Method | Path                   | Guard                                | Quién |
|--------|------------------------|---------------------------------------|-------|
| POST   | `/auths/register`      | público                               | registro público, siempre `role: USER` |
| POST   | `/auths/admin-register`| `JwtAuthGuard` + `RolesGuard(ADMIN)`  | admin crea un usuario con cualquier `role` |

Todas las respuestas de `users` pasan por `UserResponseDto` (`plainToInstance`
+ `excludeExtraneousValues`) — `passwordHash` nunca sale en una respuesta.

### GET /users — filtros y paginación

`FindUsersDto`: `email` (contains, case-insensitive), `name` (contains,
case-insensitive), `role` (exact, `Role` enum), `page`/`limit` (paginación
server-side, mismo shape que `vendors`/`fragrances`: default `page=1`,
`limit=20`, `limit` máximo `100`).

### POST /auths/admin-register — creación (admin)

`AdminCreateUserDto` (`src/auths/dto/`): `name`, `email`, `password` (texto
plano, `@IsStrongPassword()`, igual que `RegisterDto`), `role`. El servicio
(`AuthsService.adminCreate`) hashea la password con `PasswordsService` (mismo
mecanismo que `AuthsService.register`) antes de insertar — nunca se persiste
ni se recibe un hash desde el cliente. Duplicado de `name`/`email` → `409
Conflict` (mismo patrón de doble chequeo que `register`: `findByEmail`
optimista + catch de `23505` de Postgres). A diferencia de `register`/`login`,
no devuelve `accessToken` — quien llama es el admin, no la cuenta creada, así
que no hay sesión que entregar; devuelve solo el `UserResponseDto` creado.

### PATCH /users/:id — modificación (self o admin)

`UpdateUserDto` (`src/users/dto/`) declara directamente `name`, `email`,
`photoS3Key`, todos opcionales — **no incluye `role` ni `password`**, ni
para el propio usuario ni para el admin, a propósito (ver "Decisiones de
seguridad"). Duplicado de `name`/`email` contra otro usuario → `409
Conflict`. Id inexistente → `404 Not Found`.

### DELETE /users/:id — baja (admin)

Hard delete. `favorites.userId` tiene `onDelete: 'cascade'` (ver
`src/database/schema/favorite.schema.ts`), así que borrar un usuario borra
también sus favoritos; no hay otras FKs hacia `users` hoy (`listings` no
tiene owner/seller). Id inexistente → `404 Not Found`.

## Decisiones de seguridad

- **El cambio de `role` no es parte de este contrato**, ni para admin ni
  para el propio usuario — se excluye completamente de `UpdateUserDto` en
  vez de condicionar el campo según quién llama. "Promover a admin" es una
  operación sensible que no estaba pedida explícitamente y queda fuera de
  alcance; si se necesita, es un endpoint/flujo aparte y explícito, no un
  campo más de un PATCH genérico.
- **El cambio de password no es parte de este contrato** — un cambio de
  password sin pedir la password actual es un hueco de seguridad (un JWT
  robado podría usarse para tomar la cuenta cambiando la password sin
  saber la original). Un flujo de "cambiar password" (que pida la password
  actual) queda fuera de alcance de esta revisión.
- **La password nunca viaja como hash** — `AdminCreateUserDto.password` es
  texto plano validado con `@IsStrongPassword()`; el hash lo calcula
  `PasswordsService` (argon2) del lado del servidor, igual que en
  `AuthsService.register`.
- **`users` no crea cuentas** — ni siquiera para el admin. Crear una cuenta
  implica hashear una password y validar sus reglas de fortaleza, que es
  exactamente lo que ya resuelve `auths`; duplicar esa lógica en `users`
  fragmentaría dónde vive "cómo se crea un usuario". `users` solo administra
  cuentas que ya existen.

## Fuera de alcance

- Batch endpoints (`POST/PATCH/DELETE /users/batch`) — decisión explícita
  del usuario: `users` maneja datos ligados a credenciales (unicidad de
  email en update) y tiene un caso de uso (auto-gestión de perfil) que es
  inherentemente single-item, a diferencia de `vendors`/`fragrances`. Se
  documenta como desviación deliberada del default de `module-standards`.
- Cambio de `role` de un usuario existente (promover/degradar admin).
- Cambio de password vía este módulo (requiere flujo propio con
  verificación de password actual).
- Auto-eliminación de cuenta por parte del propio usuario (el contrato
  pedido solo cubre "ver" y "modificar" para el propio usuario).
- Convención real de `photoS3Key` (prefijo de bucket, etc.) — no existe
  todavía un módulo de upload; se tightenea el validador al charset válido
  de una key de S3 y al largo de columna, sin inventar una convención de
  negocio que no existe.
- Tests — corresponde a una sesión de testing separada
  (`.claude/skills/testing/SKILL.md`), no a esta sesión de implementación.
