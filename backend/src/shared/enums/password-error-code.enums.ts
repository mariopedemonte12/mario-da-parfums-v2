// Códigos de las reglas de fortaleza de contraseña (@IsStrongPassword).
// Separado de ValidationErrorCode porque es un validador compuesto: una sola
// contraseña puede fallar varias reglas a la vez y cada una necesita su
// propio código para que el frontend marque cuáles se cumplen.
export enum PasswordErrorCode {
  MIN_LENGTH = 'PASSWORD_MIN_LENGTH',
  UPPERCASE = 'PASSWORD_UPPERCASE',
  LOWERCASE = 'PASSWORD_LOWERCASE',
  NUMBER = 'PASSWORD_NUMBER',
  SPECIAL_CHAR = 'PASSWORD_SPECIAL_CHAR',
  NOT_STRING = 'PASSWORD_NOT_STRING',
}
