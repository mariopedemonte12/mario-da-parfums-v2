# Códigos de error de validación

Cada regla de validación de un DTO (`@IsRequired`, `@IsEmailField`, `@IsStrongPassword`,
etc.) no manda un mensaje en inglés/español fijo: manda uno o más **códigos**
(`{ code, meta? }`) para que el frontend elija el mensaje traducido según el
idioma del usuario. Este documento explica de dónde salen esos códigos y cómo
agregar uno nuevo sin duplicar valores. El envelope HTTP en el que viajan estos
códigos (`FieldError[]`) está documentado en
[`error-handling.md`](./error-handling.md).

## El problema que resuelve esto

Antes, cada wrapper y cada DTO definía sus códigos como strings sueltos:

```ts
@IsRequired('NAME_REQUIRED')
@IsStringField('NAME_INVALID_TYPE')
```

Nada impedía que dos DTOs usaran un código distinto para el mismo caso
(`NAME_REQUIRED` vs `NAME_MISSING`) o que un typo (`'NAME_REQUIED'`) pasara
silenciosamente: TypeScript no lo detecta porque `code` era `string`, y el
código igual compila y corre — el frontend simplemente no encuentra la
traducción y listo. Con dos enums centralizados en `src/shared/enums/`, todos
los validadores importan el mismo catálogo y TypeScript rechaza cualquier
código que no exista ahí.

## Los dos enums

### `ValidationErrorCode` — [`src/shared/enums/validation-error-code.enums.ts`](../src/shared/enums/validation-error-code.enums.ts)

Catálogo general: los códigos genéricos que usan por default los wrappers de
`src/validators/wrappers`, más los códigos específicos por campo que los DTOs
pasan cuando quieren un mensaje más preciso que el genérico.

El listado completo y vigente de códigos está en la sección
[Catálogo de códigos](#catálogo-de-códigos) más abajo; el enum es la fuente de verdad.

### `PasswordErrorCode` — [`src/shared/enums/password-error-code.enums.ts`](../src/shared/enums/password-error-code.enums.ts)

Separado del catálogo general porque `@IsStrongPassword` es un validador
compuesto: una sola contraseña puede violar varias reglas a la vez
(`PASSWORD_MIN_LENGTH`, `PASSWORD_UPPERCASE`, ...) y el frontend necesita la
lista completa para marcar cada regla en su checklist de "requisitos de
contraseña", no solo la primera que falla.

## Cómo se usan hoy

**Wrappers** (`src/validators/wrappers/*`): cada wrapper tipa su parámetro
`code` como `ValidationErrorCode` y trae un default genérico, así un DTO que
no necesita un mensaje específico no tiene que pasar nada:

```ts
// is-not-empty.wrapper.ts
export function IsRequired(
    code: ValidationErrorCode = ValidationErrorCode.FIELD_REQUIRED,
    options?: ValidationOptions,
) { ... }
```

**DTOs**: cuando el campo necesita un código más específico que el genérico
(para que el frontend distinga "el nombre es obligatorio" de "el email es
obligatorio"), se lo pasa explícitamente desde el enum — ver
[`admin-create-user.dto.ts`](../src/auths/dto/admin-create-user.dto.ts) como
ejemplo de referencia:

```ts
export class AdminCreateUserDto {
    @IsRequired(ValidationErrorCode.NAME_REQUIRED)
    @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
    @IsNotProfane()
    name: string;

    @IsRequired(ValidationErrorCode.EMAIL_REQUIRED)
    @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
    @IsNotProfane()
    email: string;

    @IsRequired(ValidationErrorCode.PASSWORD_REQUIRED)
    @IsStrongPassword()
    password: string;

    @IsEnumField(Role, ValidationErrorCode.ROLE_INVALID)
    role: Role;
}
```

`LoginDto` y `RegisterDto` (`src/auths/dto/`) reutilizan los mismos códigos de
`EMAIL_REQUIRED`/`EMAIL_INVALID_FORMAT`/`NAME_REQUIRED`/`PASSWORD_REQUIRED`
que `AdminCreateUserDto` — es justamente el punto de tener un catálogo único:
el campo `email` significa lo mismo (y se traduce igual en el frontend) sin
importar en qué DTO aparece. Cuenta creación (pública o admin) vive entera en
`auths`; `users` (`update-user.dto.ts`) reutiliza los mismos códigos de
`name`/`email`/`photoS3Key` para sus propios campos de perfil.

**Validadores custom** (`@IsNotProfane`, `@IsStrongPassword`): al no ser
wrappers de una regla de `class-validator`, no reciben un `code` por
parámetro — devuelven directamente los enums desde su `defaultMessage`:

```ts
// is-password-strong.validator.ts
function checkPasswordRules(value: string) {
    return {
        [PasswordErrorCode.MIN_LENGTH]: { valid: ..., meta: { min: 8, actual: value.length } },
        [PasswordErrorCode.UPPERCASE]: { valid: ... },
        // ...
    };
}
```

## Catálogo de códigos

Todos los valores de `ValidationErrorCode` (los de fortaleza de contraseña están
en `PasswordErrorCode`, ver arriba). Los códigos `*_REQUIRED` salen cuando el
campo falta o viene vacío, `*_INVALID_TYPE`/`*_INVALID_FORMAT` cuando el tipo o
el formato no corresponde, `*_TOO_LONG` cuando excede el máximo del campo.
Todos viajan como `errors: [{ field, errors: [{ code, meta? }] }]` con HTTP `400`,
salvo los dos de conflicto (ver más abajo).

| Grupo | Códigos |
|---|---|
| Genéricos (defaults de los wrappers) | `FIELD_REQUIRED`, `INVALID_TYPE`, `INVALID_ENUM_VALUE` (`meta: { allowed, actual }`), `MIN_LENGTH` (`meta: { min, actual }`), `MAX_LENGTH` (`meta: { max, actual }`) |
| Contenido | `CONTAINS_PROFANITY`, `CONTAINS_MARKUP`, `CONTAINS_NUL_CHARACTER` |
| name (usuarios) | `NAME_REQUIRED`, `NAME_INVALID_TYPE`, `NAME_TOO_LONG`, `NAME_ALREADY_TAKEN` (409) |
| email | `EMAIL_REQUIRED`, `EMAIL_INVALID_FORMAT`, `EMAIL_ALREADY_REGISTERED` (409) |
| role | `ROLE_INVALID` |
| photoS3Key | `PHOTO_S3_KEY_INVALID_TYPE`, `PHOTO_S3_KEY_INVALID_FORMAT`, `PHOTO_S3_KEY_TOO_LONG` |
| password (presencia/tipo) | `PASSWORD_REQUIRED`, `PASSWORD_INVALID_TYPE` |
| fragrances | `BRAND_REQUIRED`, `BRAND_INVALID_TYPE`, `BRAND_TOO_LONG`, `CONCENTRATION_INVALID_TYPE`, `CONCENTRATION_TOO_LONG`, `DESCRIPTION_INVALID_TYPE`, `IMAGE_URL_INVALID_FORMAT`, `IMAGE_URL_TOO_LONG`, `OLFACTORY_FAMILY_INVALID_TYPE`, `OLFACTORY_FAMILY_TOO_LONG`, `TARGET_AUDIENCE_INVALID_TYPE`, `TARGET_AUDIENCE_TOO_LONG`, `LONGEVITY_INVALID_TYPE`, `LONGEVITY_TOO_LONG` |
| vendors | `VENDOR_NAME_REQUIRED`, `VENDOR_NAME_INVALID_TYPE`, `VENDOR_NAME_TOO_LONG`, `VENDOR_WEBSITE_URL_REQUIRED`, `VENDOR_WEBSITE_URL_INVALID_FORMAT`, `VENDOR_WEBSITE_URL_TOO_LONG` |
| listings | `LISTING_FRAGRANCE_ID_REQUIRED`, `LISTING_FRAGRANCE_ID_INVALID_FORMAT`, `LISTING_VENDOR_ID_REQUIRED`, `LISTING_VENDOR_ID_INVALID_TYPE`, `LISTING_SIZE_ML_REQUIRED`, `LISTING_SIZE_ML_INVALID_TYPE`, `LISTING_PRICE_REQUIRED`, `LISTING_PRICE_INVALID_TYPE`, `LISTING_URL_REQUIRED`, `LISTING_URL_INVALID_FORMAT`, `LISTING_URL_TOO_LONG`, `LISTING_IN_STOCK_INVALID_TYPE` |
| favorites | `FRAGRANCE_ID_REQUIRED`, `FRAGRANCE_ID_INVALID_FORMAT`, `FRAGRANCE_IDS_REQUIRED` |

### Códigos con comportamiento propio

**`CONTAINS_NUL_CHARACTER`** — HTTP `400`. Un string con el byte NUL (`\u0000`,
`%00`) en cualquier lugar del body, query string o params de ruta, de cualquier
endpoint (`POST /auths/register`, `/auths/login`, `POST /vendors/batch`,
`GET /fragrances?search=a%00b`, `GET /fragrances/abc%00`, ...). Lo produce
`customValidationPipe` antes de la validación del DTO (y `@IsNoNul` en los query
DTOs); `field` es la ruta con puntos (`items.0.name`) o el nombre del param (`id`).
Sin `meta`. Ver `specs/nul-byte-rejection.md`.

```json
{ "statusCode": 400, "message": "Validation failed",
  "errors": [{ "field": "items.0.name", "errors": [{ "code": "CONTAINS_NUL_CHARACTER" }] }],
  "timestamp": "..." }
```

**`EMAIL_ALREADY_REGISTERED`** — HTTP `409`. `POST /auths/register`,
`POST /auths/admin-register` (y `PATCH /users/:id` al cambiar el email) cuando el
email ya existe: por el chequeo previo o por la violación de la unique constraint
`users_email_unique` (carrera). `field: "email"`. No es un error de validación del
DTO sino un `ConflictException` (`src/common/utils/user-conflict.util.ts`) que usa
el mismo sobre.

**`NAME_ALREADY_TAKEN`** — HTTP `409`. Mismos endpoints, cuando falla la unique
constraint `users_name_unique` (no hay chequeo previo por nombre). `field: "name"`.

```json
{ "statusCode": 409, "message": "Email already registered",
  "errors": [{ "field": "email", "errors": [{ "code": "EMAIL_ALREADY_REGISTERED" }] }],
  "timestamp": "..." }
```

Una violación de unicidad con una constraint no reconocida devuelve `409` sin
`errors` (mensaje genérico), para no atribuir el error a un campo equivocado.

## Cómo agregar un DTO/campo nuevo

1. **¿El campo encaja en un código genérico?** (`FIELD_REQUIRED`,
   `INVALID_TYPE`, `MIN_LENGTH`, `MAX_LENGTH`, `INVALID_ENUM_VALUE`) — no pases
   nada, el wrapper ya lo usa por default.
2. **¿El frontend necesita distinguir este campo de otros con el mismo tipo de
   error?** — agregá el código nuevo a `ValidationErrorCode` en
   `src/shared/enums/validation-error-code.enums.ts` (agrupado junto a los de
   su campo, siguiendo el patrón `<CAMPO>_<REGLA>`) y pasalo al wrapper:
   `@IsRequired(ValidationErrorCode.PRICE_REQUIRED)`.
3. **Nunca** escribas el código como string literal (`@IsRequired('X_REQUIRED')`)
   — si no existe en el enum, agregalo ahí primero. Esto es lo que garantiza
   que no aparezcan dos códigos distintos para el mismo caso.
4. **¿Es un validador compuesto** (como la fortaleza de contraseña, que
   evalúa varias reglas sobre el mismo valor y puede devolver varios códigos a
   la vez)? Considerá un enum dedicado como `PasswordErrorCode` en vez de
   mezclar sus códigos en `ValidationErrorCode`.

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `src/shared/enums/validation-error-code.enums.ts` | Catálogo general de códigos (`ValidationErrorCode`) |
| `src/shared/enums/password-error-code.enums.ts` | Códigos de las reglas de fortaleza de contraseña (`PasswordErrorCode`) |
| `src/shared/validation-codes.ts` | Formas `FieldError`/`ValidationErrorItem` en las que viajan los códigos |
| `src/validators/helpers/build-error-message.ts` | Serializa `{ code, meta? }` a JSON dentro del `message` de class-validator |
| `src/validators/wrappers/*` | Wrappers de reglas nativas de class-validator, tipados con `ValidationErrorCode` |
| `src/validators/is-not-profane.validator.ts`, `is-password-strong.validator.ts` | Validadores custom que devuelven los enums directamente |
| `src/pipes/custom-validation.pipe.ts` | Parsea el JSON del `message` de vuelta a `ValidationErrorItem[]` |
| `src/auths/dto/admin-create-user.dto.ts` | Ejemplo de referencia de un DTO usando `ValidationErrorCode` |
