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

```ts
export enum ValidationErrorCode {
    // Genéricos (defaults de los wrappers)
    FIELD_REQUIRED = 'FIELD_REQUIRED',
    INVALID_TYPE = 'INVALID_TYPE',
    INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',
    MIN_LENGTH = 'MIN_LENGTH',
    MAX_LENGTH = 'MAX_LENGTH',
    CONTAINS_PROFANITY = 'CONTAINS_PROFANITY',

    // Por campo
    NAME_REQUIRED = 'NAME_REQUIRED',
    NAME_INVALID_TYPE = 'NAME_INVALID_TYPE',
    EMAIL_REQUIRED = 'EMAIL_REQUIRED',
    EMAIL_INVALID_FORMAT = 'EMAIL_INVALID_FORMAT',
    ROLE_INVALID = 'ROLE_INVALID',
    PHOTO_S3_KEY_INVALID_TYPE = 'PHOTO_S3_KEY_INVALID_TYPE',
    PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
    PASSWORD_INVALID_TYPE = 'PASSWORD_INVALID_TYPE',
}
```

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
[`create-user.dto.ts`](../src/users/dto/create-user.dto.ts) como ejemplo de
referencia:

```ts
export class CreateUserDto {
    @IsRequired(ValidationErrorCode.NAME_REQUIRED)
    @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
    @IsNotProfane()
    name: string;

    @IsRequired(ValidationErrorCode.EMAIL_REQUIRED)
    @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
    @IsNotProfane()
    email: string;

    @IsEnumField(Role, ValidationErrorCode.ROLE_INVALID)
    role: Role;

    // passwordHash no es input de usuario: se deja el default genérico (INVALID_TYPE)
    @IsStringField()
    passwordHash: string;

    @IsOptional()
    @IsStringField(ValidationErrorCode.PHOTO_S3_KEY_INVALID_TYPE)
    photoS3Key?: string;
}
```

`LoginDto` y `RegisterDto` (`src/auths/dto/`) reutilizan los mismos códigos de
`EMAIL_REQUIRED`/`EMAIL_INVALID_FORMAT`/`NAME_REQUIRED`/`PASSWORD_REQUIRED`
que `CreateUserDto` — es justamente el punto de tener un catálogo único: el
campo `email` significa lo mismo (y se traduce igual en el frontend) sin
importar en qué DTO aparece.

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
| `src/users/dto/create-user.dto.ts` | Ejemplo de referencia de un DTO usando `ValidationErrorCode` |
