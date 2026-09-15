# legal-terms — vista de Términos y Condiciones y Política de Privacidad

## Propósito

Agregar una vista pública, de solo lectura, con los términos y condiciones de
uso de Mario da Parfums y su política de privacidad: qué es la plataforma,
qué datos/cookies usa y para qué, qué libertades tiene la persona usuaria
respecto del sitio, la aclaración central de que **los precios mostrados son
referenciales** — el precio y la disponibilidad efectivos se confirman en el
sitio del vendor —, y el detalle de tratamiento de datos personales exigido
por la normativa chilena de protección de datos.

No es una vista de gestión (no hay CRUD, no hay admin involucrado) ni
requiere autenticación: es contenido estático, accesible para cualquier
visitante, igual que comparar precios (§5.3 de `platform-spec.md`).

Este documento fija **qué debe decir la página** (el contenido legal/factual,
consistente con `platform-spec.md`) y su alcance funcional. La redacción
final del texto legal, el copy exacto y el layout visual quedan a criterio de
implementación, siempre que cubran cada punto de la sección "Contenido
requerido" sin contradecirlo.

## Contenido requerido

La página debe cubrir, como mínimo, estos bloques (no necesariamente en este
orden, y pueden agruparse bajo secciones con otros títulos):

### 1. Qué es la plataforma

- Mario da Parfums es un **comparador de precios de perfumes en Chile**. No
  vende perfumes ni procesa pagos, no hay carrito ni checkout
  (`platform-spec.md` §1 y §9).
- El sitio deriva a la página del vendor para la compra; la transacción
  ocurre fuera de Mario da Parfums, bajo los términos del vendor
  correspondiente.

### 2. Precios y disponibilidad — referenciales

- Los precios y la disponibilidad que muestra el sitio provienen de un
  proceso de actualización periódica (job diario, `platform-spec.md` §4.2) y
  **son referenciales**: pueden no reflejar el precio o el stock real al
  momento exacto en que la persona los consulta.
- Antes de comprar, la persona debe **visitar la página del vendor
  enlazada** para confirmar el precio efectivo y la disponibilidad real —
  Mario da Parfums no garantiza que el precio mostrado sea el precio final de
  compra.
- Mario da Parfums no es responsable por diferencias entre el precio/
  disponibilidad mostrados y los del sitio del vendor, ni por el proceso de
  compra, envío, garantía o postventa, que son enteramente responsabilidad
  del vendor.

### 3. Cookies y sesión

Debe explicarse en lenguaje simple (no jurídico-denso) que:

- El sitio usa **una única cookie**, de sesión, para mantener autenticada a
  la persona usuaria entre visitas cuando inicia sesión (login). Es una
  cookie **httpOnly** (no accesible por JavaScript) con `SameSite=Lax`
  (ver `specs/auth-pages.md`, sección "Contract assumption: cookie-based
  session").
- Esa cookie es **estrictamente funcional**: solo sirve para reconocer la
  sesión de una cuenta ya iniciada (para mostrar favoritos, perfil, etc.). No
  se usa para rastrear comportamiento de navegación.
- **No existen cookies ni scripts de analítica, tracking o publicidad**, ni
  propios ni de terceros. El sitio no envía datos de navegación a servicios
  externos de analítics (confirmado contra el código: no hay dependencias de
  analítica en el frontend a la fecha de este spec).
- Navegar el sitio y comparar precios **no requiere cuenta ni login**
  (`platform-spec.md` §5.3) — y por lo tanto no requiere aceptar ninguna
  cookie: la cookie de sesión solo se genera si la persona decide
  registrarse/iniciar sesión.

### 4. Datos de la cuenta — uso y libertades

- Los datos de una cuenta (registro/login, favoritos) se usan únicamente
  para operar la funcionalidad de la cuenta (recordar sesión, mostrar/
  administrar favoritos) — **no se usan con fines de analítica, perfilamiento
  o marketing**, ni son compartidos con o vendidos a terceros.
- Crear una cuenta es opcional y solo es necesario para usar favoritos
  (`platform-spec.md` §5.4); toda persona puede comparar precios sin
  registrarse.
- La persona puede cerrar sesión en cualquier momento (acción "Salir" en el
  navbar/perfil); esto termina la sesión activa.
- Fuera de alcance de este documento (y del producto en general, por ahora,
  `platform-spec.md` §9): no hay flujo de exportar o eliminar la cuenta
  propia todavía — si se agrega, esta página debe actualizarse para
  describirlo.

### 5. Contenido del catálogo — origen y precisión

- El catálogo de fragancias (nombres, marcas, descripciones) proviene de un
  dataset externo con descripciones sintéticas generadas para este proyecto,
  no de las fichas oficiales de cada marca (`platform-spec.md` §4.1) — vale
  la pena una mención breve de que las descripciones son referenciales/
  ilustrativas, no material oficial del fabricante.
- Vendors y precios son, en esta fase del proyecto, generados de forma
  determinística (no scraping en vivo todavía, `platform-spec.md` §4.2) — no
  hace falta detallar esto en la vista pública con ese nivel técnico, pero el
  punto 2 (precios referenciales) ya cubre la consecuencia visible para la
  persona usuaria y es lo que sí debe decir la página.

### 6. Uso aceptable / limitaciones

- El sitio se ofrece "tal cual", tal como está disponible; el uso del
  comparador para tomar decisiones de compra es responsabilidad de quien
  navega.
- No se debe prometer disponibilidad ni exactitud de precio en tiempo real
  (reafirma el punto 2).

### 7. Política de privacidad — cumplimiento normativo chileno

Marco legal de referencia: **Ley N° 19.628 sobre Protección de la Vida
Privada** (ley vigente hoy) y, como estándar a anticipar, **Ley N° 21.719**
(nueva ley de protección de datos personales, publicada 13-12-2024, con
entrada en vigor escalonada — en torno a diciembre de 2026 para sus
obligaciones generales; **verificar la fecha exacta vigente al momento de
publicar** antes de afirmarla en el copy final). Este spec fija el contenido
mínimo que la política debe declarar para ser consistente con ambos marcos;
no reemplaza una revisión por un abogado — es un checklist de buenas
prácticas, no asesoría legal certificada, y así debe tratarse antes de un
uso real/productivo del sitio.

Datos personales efectivamente recopilados hoy (verificado contra
`backend/src/database/schema/user.schema.ts` y `backend/CLAUDE.md`), la
política debe listarlos con precisión, sin inventar categorías que no se
recolectan:

- **Cuenta**: nombre, correo electrónico, contraseña (almacenada como hash
  con `argon2`, nunca en texto plano ni recuperable), rol (`USER`/`ADMIN`),
  fecha de creación/última actualización de la cuenta.
- **Perfil (opcional)**: foto de perfil, si la persona decide subir una
  (almacenada en un proveedor de almacenamiento de objetos S3-compatible).
- **Favoritos**: relación entre la cuenta y las fragancias marcadas como
  favoritas (`platform-spec.md` §3, entidad `Favorite`).
- **No se recopilan**: datos de pago, dirección, teléfono, ni categorías de
  datos sensibles (salud, origen étnico, afiliación política/religiosa,
  etc.) — el sitio no procesa compras ni pagos (§1).

La política debe cubrir, como mínimo:

- **Responsable del tratamiento**: quién trata los datos y un canal de
  contacto para consultas o ejercicio de derechos. *(La identidad/razón
  social exacta a declarar aquí es una decisión del usuario del proyecto,
  no de este spec — dejar como placeholder explícito hasta que se
  confirme, no inventar una entidad.)*
- **Finalidad del tratamiento**: autenticación (registro/login), mantener
  la sesión, y gestión de favoritos/perfil — explícitamente **no** para
  perfilamiento, publicidad dirigida ni analítica (consistente con la
  sección 3 y 4 de este documento).
- **Base de licitud**: consentimiento otorgado al registrarse (aceptación
  de estos términos) y necesidad de ejecutar el servicio solicitado por la
  propia persona (mantener sesión iniciada, mostrar sus favoritos).
- **Derechos de la persona titular (ARCO / ARCOP)**: acceso, rectificación,
  cancelación/eliminación y oposición (derechos ya reconocidos por la Ley
  19.628); mencionar también portabilidad, dado que la Ley 21.719 los
  amplía a "ARCOP". Debe describirse cómo ejercerlos (mismo canal de
  contacto que el punto anterior) — sin comprometer un plazo de respuesta
  específico que la implementación no pueda cumplir.
- **Conservación de datos**: mientras la cuenta permanezca activa. Debe
  declarar explícitamente que **hoy no existe un flujo self-service para
  exportar o eliminar la cuenta propia** (mismo gap ya anotado en la
  sección 4) — una solicitud de eliminación se gestiona hoy por el canal de
  contacto, de forma manual, no automatizada.
- **Medidas de seguridad**: contraseñas con hash `argon2` (nunca
  almacenadas ni transmitidas en texto plano), sesión vía JWT en cookie
  `httpOnly` (no legible por JavaScript, ver sección 3).
- **Encargados de tratamiento / terceros técnicos**: el proveedor de
  almacenamiento de objetos usado para fotos de perfil actúa como
  encargado técnico de almacenamiento, no como tercero que use los datos
  para fines propios. Fuera de eso, no hay integraciones de terceros que
  reciban datos personales (sin analítica, sin CRM, sin pasarelas de pago
  — §1 y sección 3).
- **Transferencia internacional de datos**: la infraestructura de
  hosting/producción todavía no está definida (`platform-spec.md` §9,
  "infraestructura al final"). Si el proveedor de hosting o almacenamiento
  termina alojado fuera de Chile, este documento **debe actualizarse**
  para declarar la transferencia y las garantías aplicables — se deja
  marcado como pendiente, no resuelto por este spec.
- **Menores de edad**: el servicio no está dirigido a menores de edad; no
  existe verificación de edad en el registro (declarar esta limitación, no
  prometer un control que no existe).
- **Modificaciones a la política**: debe mostrarse una fecha de última
  actualización visible en la página, y notificarse (al menos mediante esa
  fecha) cuando el contenido cambie.

## Alcance funcional (frontend)

- **Ruta pública** bajo `frontend/src/app` (p. ej. `/terminos` o
  `/legal`), fuera del grupo `(auth)`, sin gate de sesión — accesible
  logueado o no.
- Sigue siendo **una vista simple**, no dos flujos separados: Términos y
  Condiciones (secciones 1-2, 5-6) y Política de Privacidad (secciones 3-4,
  7) conviven en la misma página, como dos secciones claramente tituladas
  (p. ej. con anclas `#terminos` / `#privacidad`) en vez de dos rutas
  distintas — mantiene el pedido original de "vista simple" sin perder
  separación de lectura entre ambos contenidos.
- Vista de solo lectura: sin formularios, sin llamadas a la API del backend.
  Todo el contenido es estático (texto fijo en el componente/página), salvo
  la fecha de última actualización si se decide incluirla.
- Se agrega un enlace hacia esta vista desde el **Footer**
  (`frontend/src/features/layout/components/Footer.tsx`), consistente con
  el resto de enlaces del footer (hoy son placeholders estáticos sin
  `href`; este sí debe navegar de verdad a la nueva ruta).
- No se agrega un modal/banner de "aceptar cookies" — no aplica: no hay
  cookies no esenciales que requieran consentimiento, solo la cookie de
  sesión funcional descrita en la sección 3, que además solo se crea si la
  persona decide loguearse.

## Fuera de alcance

- Revisión por un abogado / certificación legal formal del documento — la
  sección 7 fija un checklist de contenido de buenas prácticas, no
  asesoría legal validada; sigue siendo responsabilidad del usuario del
  proyecto obtener esa revisión antes de un uso real/productivo.
- Flujo self-service de exportar o eliminar la cuenta propia (data
  portability / "derecho al olvido" automatizado) — declarado como gap
  conocido en las secciones 4 y 7, no resuelto por esta feature.
- Registro/inscripción ante la (futura) Agencia de Protección de Datos
  Personales u otro trámite administrativo de la Ley 21.719 — eso es una
  obligación institucional del operador del proyecto, no algo que resuelva
  una vista de frontend.
- Términos de servicio para vendors (los vendors no son actores del sistema
  con login propio, `platform-spec.md` §9).
- Internacionalización / multi-idioma (el resto del sitio está en español,
  esta vista sigue el mismo criterio).
- Versionado histórico de los términos (changelog de cambios al documento,
  más allá de mostrar la fecha de última actualización).
- Banner/modal de consentimiento de cookies (ver última nota de "Alcance
  funcional").
