import { ApiError, type FieldError } from "@/lib/api/errors";

// Translates backend validation codes (backend/docs/validation-error-codes.md)
// into Spanish copy. Deliberately not a re-implementation of the backend's
// password-strength rules — the backend's response is the single source of
// truth for what's valid; this only covers the codes register's fields can
// actually produce. See specs/auth-pages.md, "/register".
const ERROR_MESSAGES: Record<string, (meta?: Record<string, unknown>) => string> = {
  NAME_REQUIRED: () => "El nombre es obligatorio.",
  NAME_INVALID_TYPE: () => "El nombre no es válido.",
  NAME_ALREADY_TAKEN: () => "Ese nombre ya está en uso.",
  CONTAINS_PROFANITY: () => "Este texto no está permitido.",
  EMAIL_REQUIRED: () => "El correo es obligatorio.",
  EMAIL_INVALID_FORMAT: () => "Ingresá un correo válido.",
  EMAIL_ALREADY_REGISTERED: () => "Ese correo ya está registrado.",
  PASSWORD_REQUIRED: () => "La contraseña es obligatoria.",
  PASSWORD_INVALID_TYPE: () => "La contraseña no es válida.",
  PASSWORD_NOT_STRING: () => "La contraseña no es válida.",
  PASSWORD_MIN_LENGTH: (meta) => `Mínimo ${(meta?.min as number | undefined) ?? 8} caracteres.`,
  PASSWORD_UPPERCASE: () => "Al menos una mayúscula.",
  PASSWORD_LOWERCASE: () => "Al menos una minúscula.",
  PASSWORD_NUMBER: () => "Al menos un número.",
  PASSWORD_SPECIAL_CHAR: () => "Al menos un carácter especial.",
};

export const REGISTER_CONFLICT_MESSAGE =
  "No pudimos crear la cuenta: ya existe un usuario con esos datos.";
export const REGISTER_GENERIC_MESSAGE = "Ocurrió un error. Intentá de nuevo.";

export type RegisterErrorState = {
  name: string[];
  email: string[];
  password: string[];
  form: string | null;
};

function translateFieldErrors(field: FieldError | undefined, fallback: string): string[] {
  if (!field) return [];
  return field.errors.map((item) => ERROR_MESSAGES[item.code]?.(item.meta) ?? fallback);
}

// Maps whatever `register()` threw to per-field messages plus an optional
// general message (specs/register-conflict-errors.md).
export function mapRegisterError(err: unknown): RegisterErrorState {
  const result: RegisterErrorState = { name: [], email: [], password: [], form: null };

  if (err instanceof ApiError && err.statusCode === 400) {
    result.name = translateFieldErrors(err.fieldError("name"), err.message);
    result.email = translateFieldErrors(err.fieldError("email"), err.message);
    result.password = translateFieldErrors(err.fieldError("password"), err.message);
  } else if (err instanceof ApiError && err.statusCode === 409) {
    // The backend names the colliding field in errors[]. A 409 that names
    // neither (unrecognized constraint) is not attributed to any input.
    result.name = translateFieldErrors(err.fieldError("name"), err.message);
    result.email = translateFieldErrors(err.fieldError("email"), err.message);
    if (result.name.length === 0 && result.email.length === 0) {
      result.form = REGISTER_CONFLICT_MESSAGE;
    }
  } else {
    result.form = REGISTER_GENERIC_MESSAGE;
  }
  return result;
}
