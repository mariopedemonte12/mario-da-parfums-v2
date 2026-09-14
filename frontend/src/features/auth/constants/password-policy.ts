// Mirrors backend/src/validators/is-password-strong.validator.ts
// (checkPasswordRules) — deliberately duplicated for the live "as you type"
// checklist. See specs/auth-pages.md ("/register") for why this one piece
// of UX is exempt from the "don't duplicate password rules" rule: the
// backend's response is still the sole authority at submit time, this only
// drives a live hint. Keep the five rules/order in sync with the backend
// if `IsStrongPassword` ever changes.
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  code: string;
  label: string;
  test: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    code: "PASSWORD_MIN_LENGTH",
    label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    code: "PASSWORD_UPPERCASE",
    label: "Al menos una mayúscula",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    code: "PASSWORD_LOWERCASE",
    label: "Al menos una minúscula",
    test: (value) => /[a-z]/.test(value),
  },
  {
    code: "PASSWORD_NUMBER",
    label: "Al menos un número",
    test: (value) => /\d/.test(value),
  },
  {
    code: "PASSWORD_SPECIAL_CHAR",
    label: "Al menos un carácter especial",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];
