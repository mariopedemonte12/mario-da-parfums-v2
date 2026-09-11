// Catálogo único de códigos de error de validación de DTOs.
// Toda la aplicación (validators, wrappers, DTOs) debe importar los códigos
// desde acá en vez de usar strings sueltos, para que no existan dos códigos
// distintos para el mismo caso y el frontend pueda traducirlos sin ambigüedad.
// Ver docs/validation-error-codes.md para el detalle de cómo se usa este enum.
export enum ValidationErrorCode {
    // Genéricos: son los defaults de los wrappers en src/validators/wrappers.
    // Se usan tal cual cuando el campo no necesita un código más específico.
    FIELD_REQUIRED = 'FIELD_REQUIRED',
    INVALID_TYPE = 'INVALID_TYPE',
    INVALID_ENUM_VALUE = 'INVALID_ENUM_VALUE',
    MIN_LENGTH = 'MIN_LENGTH',
    MAX_LENGTH = 'MAX_LENGTH',
    CONTAINS_PROFANITY = 'CONTAINS_PROFANITY',

    // name
    NAME_REQUIRED = 'NAME_REQUIRED',
    NAME_INVALID_TYPE = 'NAME_INVALID_TYPE',

    // email
    EMAIL_REQUIRED = 'EMAIL_REQUIRED',
    EMAIL_INVALID_FORMAT = 'EMAIL_INVALID_FORMAT',

    // role
    ROLE_INVALID = 'ROLE_INVALID',

    // photoS3Key
    PHOTO_S3_KEY_INVALID_TYPE = 'PHOTO_S3_KEY_INVALID_TYPE',

    // password: presencia/tipo. Para las reglas de fortaleza ver PasswordErrorCode.
    PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
    PASSWORD_INVALID_TYPE = 'PASSWORD_INVALID_TYPE',
}
