# Sistema de manejo de errores unificado

Toda la API responde los errores con el mismo sobre (envelope) JSON, sin importar
si el error viene de una validación de DTO, una regla de negocio (`ConflictException`,
`UnauthorizedException`, etc.) o un bug/fallo inesperado (DB caída, excepción no controlada).

Dos piezas trabajan juntas para lograr esto:

1. **`customValidationPipe`** (`src/pipes/custom-validation.pipe.ts`) — transforma los
   errores de `class-validator` en una forma estructurada.
2. **`AllExceptionsFilter`** (`src/common/filters/http-exception.filter.ts`) — filtro global
   que intercepta *cualquier* excepción lanzada por un controller/servicio y la normaliza
   a la misma forma de respuesta.

Ambos están registrados globalmente en `src/main.ts`:

```ts
app.useGlobalPipes(customValidationPipe);
app.useGlobalFilters(new AllExceptionsFilter());
```

## Forma de la respuesta

Todo error HTTP devuelto por la API tiene esta forma:

```ts
{
  statusCode: number;       // código HTTP (400, 401, 409, 500, ...)
  message: string;          // mensaje legible
  errors?: FieldError[];    // solo presente si el error trae detalle por campo (ver abajo)
  timestamp: string;        // new Date().toISOString(), para correlacionar con los logs
}
```

`errors` se omite por completo (no se manda como `[]`) cuando la excepción no traía
una lista de errores por campo — así el shape no miente sobre qué información hay
disponible.

`FieldError`/`ValidationErrorItem` están definidos una sola vez en
`src/shared/validation-codes.ts` y son reutilizados tanto por el pipe de validación
como por el filtro:

```ts
export interface ValidationErrorItem { code: string; meta?: Record<string, any>; }
export interface FieldError { field: string; errors: ValidationErrorItem[]; }
```

## Caso 1: error de validación (DTO)

Cuando un `@Body()` con `class-validator` falla, `customValidationPipe` arma un
`BadRequestException({ message: 'Validation failed', errors: FieldError[] })`.
El `AllExceptionsFilter` lo recibe como cualquier otro `HttpException` y solo le
agrega el `timestamp`:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "errors": [
        { "code": "PASSWORD_MIN_LENGTH", "meta": { "min": 8, "actual": 4 } },
        { "code": "PASSWORD_UPPERCASE" },
        { "code": "PASSWORD_NUMBER" },
        { "code": "PASSWORD_SPECIAL_CHAR" }
      ]
    }
  ],
  "timestamp": "2026-09-05T17:11:16.591Z"
}
```

Los códigos (`PASSWORD_MIN_LENGTH`, `EMAIL_REQUIRED`, etc.) vienen de los
validadores custom en `src/validators/` y son pensados para que el frontend
los use como claves de traducción, en vez de parsear el mensaje en inglés.
Todos esos códigos salen de un catálogo único en `src/shared/enums`
(`ValidationErrorCode`, `PasswordErrorCode`) — ver
[`validation-error-codes.md`](./validation-error-codes.md) para el detalle de
cómo está organizado y cómo agregar códigos nuevos.

## Caso 2: error de negocio

Los servicios **no** tienen (ni necesitan) una jerarquía de excepciones propia.
Se usan directamente las excepciones HTTP que ya trae `@nestjs/common`:

```ts
throw new ConflictException('Email already registered');
throw new UnauthorizedException('Invalid email or password');
```

El filtro las normaliza igual que a cualquier `HttpException`, pero sin `errors`
(porque no traen detalle por campo):

```json
{
  "statusCode": 409,
  "message": "Email already registered",
  "timestamp": "2026-09-05T17:16:35.145Z"
}
```

**Por qué no hay una jerarquía de excepciones custom:** con dos endpoints y un
puñado de casos de negocio, una clase `AppException`/`DomainError` propia sería
ceremonia extra sin beneficio real — las excepciones built-in de Nest ya son
`HttpException`, que es exactamente lo que el filtro sabe normalizar. Si en el
futuro aparecen 5+ casos de negocio distintos y hace falta un código de error
más específico que el status HTTP, ahí sí vale la pena introducir una jerarquía.

## Caso 3: error no controlado (bug, DB caída, etc.)

Cualquier cosa que **no** sea una `HttpException` (una excepción de Postgres,
un `TypeError`, lo que sea) cae en la rama "desconocida" del filtro:

- Se loggea el mensaje y el stack completo del lado del servidor vía `Logger.error(...)`
  (útil para debug, aparece en los logs de Nest con el contexto `[AllExceptionsFilter]`).
- Al cliente **nunca** se le manda el mensaje original ni el stack — solo un 500 genérico:

```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "timestamp": "2026-09-05T17:04:50.321Z"
}
```

Esto es intencional: filtrar el mensaje de un error de driver de DB (que puede
incluir nombres de columnas, la query completa, o hasta fragmentos de la
connection string) sería una fuga de información. El test
`src/common/filters/http-exception.filter.spec.ts` verifica explícitamente que
el mensaje original nunca aparece en el body de la respuesta.

## Cómo lanzar errores nuevos

- **¿Es un error de negocio con status HTTP claro?** Usá la excepción built-in
  de Nest que corresponda (`ConflictException`, `NotFoundException`,
  `ForbiddenException`, `UnauthorizedException`, `BadRequestException`, ...).
  El filtro la va a normalizar automáticamente, no hace falta tocar nada más.
- **¿Necesitás mandar detalle por campo?** Pasá un objeto con `message` y
  `errors: FieldError[]` como argumento de la excepción, igual que hace
  `customValidationPipe`:
  ```ts
  throw new BadRequestException({ message: 'Algo falló', errors: [...] });
  ```
- **No lances `Error` "a pelo"** (`throw new Error('...')`) para casos de negocio
  esperables — esos siempre terminan como un 500 genérico, que es correcto para
  bugs/fallos inesperados pero incorrecto para algo que el cliente debería poder
  manejar (ej. "email duplicado" tiene que ser un 409, no un 500).

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `src/common/filters/http-exception.filter.ts` | Filtro global, normaliza cualquier excepción |
| `src/pipes/custom-validation.pipe.ts` | Pipe global, formatea errores de `class-validator` |
| `src/shared/validation-codes.ts` | Tipos compartidos `FieldError`/`ValidationErrorItem` |
| `src/shared/enums/` | Catálogo de códigos de error (`ValidationErrorCode`, `PasswordErrorCode`) — ver [`validation-error-codes.md`](./validation-error-codes.md) |
| `src/main.ts` | Registro de ambos vía `useGlobalPipes`/`useGlobalFilters` |
| `src/common/filters/http-exception.filter.spec.ts` | Tests: passthrough, errors[] preservado, no leak en 500 |

## Ejemplo end-to-end (auths)

`AuthsService` (`src/auths/auths.service.ts`) es el primer consumidor real de
este sistema:

```ts
// register: email duplicado
if (existing) throw new ConflictException('Email already registered');

// login: credenciales inválidas (mismo mensaje exista o no el email, para no filtrar info)
if (!user || !isValid) throw new UnauthorizedException('Invalid email or password');
```
