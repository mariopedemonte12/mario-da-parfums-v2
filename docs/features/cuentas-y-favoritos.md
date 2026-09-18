# Cuentas, sesión y favoritos



## Problema

Permitir que un usuario guarde perfumes de interés y que ciertas operaciones (administración) queden restringidas.

## Solución

Registro/login con contraseña, sesión por cookie `httpOnly`, rol `USER`/`ADMIN`, favoritos por usuario y una página de perfil.

## Funcionamiento

- **Auth** ([`auths.controller.ts`](../../backend/src/auths/auths.controller.ts)): `POST /auths/register` (siempre rol `USER`), `POST /auths/login`, `POST /auths/logout`, `POST /auths/admin-register` (solo admin; único camino para crear otro rol). Token JWT en cookie `httpOnly`, `sameSite=lax`, `secure` en producción. Login y registro limitados a 5 intentos por minuto. Contraseñas con argon2 ([`backend/src/passwords`](../../backend/src/passwords)).
- **Favoritos** ([`favorites.controller.ts`](../../backend/src/favorites/favorites.controller.ts)): `GET /favorites` (paginado, del usuario autenticado), `POST/DELETE /favorites/batch`, `GET /favorites/fragrances/:id/count`. Índice único `(userId, fragranceId)`; duplicados fallan por ítem dentro del batch.
- **Frontend**: login/registro en panel dividido, corazón de favorito en tarjetas y detalle, perfil con favoritos ([`frontend/src/features/auth`](../../frontend/src/features/auth), [`favorites`](../../frontend/src/features/favorites), [`profile`](../../frontend/src/features/profile)).

## Decisiones

Un solo modelo `User` con campo `role`; JWT en cookie en vez de `localStorage`; mutaciones en lote con éxito parcial.

## Limitaciones

- Los botones de login social del frontend ([`AuthSocialRow.tsx`](../../frontend/src/features/auth/components/AuthSocialRow.tsx)) existen solo como maqueta: los botones (Google, Apple) están deshabilitados y no hay endpoints OAuth en el backend.
- Sin recuperación de contraseña ni verificación de email (no hay endpoints ni pantallas; verificado por búsqueda en `backend/src` y `frontend/src`).
- Sin usuario admin de fábrica: el rol `admin` se asigna a mano en la base (ver [`../local-setup.md`](../local-setup.md)).
- El chatbot no conoce al usuario ni sus favoritos.
