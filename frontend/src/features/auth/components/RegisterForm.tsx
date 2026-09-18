"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ApiError, type FieldError } from "@/lib/api/errors";
import { useAuth } from "../hooks/useAuth";
import AuthField from "./AuthField";
import AuthSubmitButton from "./AuthSubmitButton";
import AuthSocialRow from "./AuthSocialRow";
import PasswordChecklist from "./PasswordChecklist";

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

function translateFieldErrors(field: FieldError | undefined, fallback: string): string[] {
  if (!field) return [];
  return field.errors.map((item) => ERROR_MESSAGES[item.code]?.(item.meta) ?? fallback);
}

export default function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [nameErrors, setNameErrors] = useState<string[]>([]);
  const [emailErrors, setEmailErrors] = useState<string[]>([]);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNameErrors([]);
    setEmailErrors([]);
    setPasswordErrors([]);
    setSubmitting(true);

    try {
      await register({ name, email, password });
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        setNameErrors(translateFieldErrors(err.fieldError("name"), err.message));
        setEmailErrors(translateFieldErrors(err.fieldError("email"), err.message));
        setPasswordErrors(translateFieldErrors(err.fieldError("password"), err.message));
      } else if (err instanceof ApiError && err.statusCode === 409) {
        // The backend names the colliding field in errors[] (see
        // specs/register-conflict-errors.md). A 409 that names neither
        // (unrecognized constraint) is not attributed to any input.
        const nameConflict = translateFieldErrors(err.fieldError("name"), err.message);
        const emailConflict = translateFieldErrors(err.fieldError("email"), err.message);
        setNameErrors(nameConflict);
        setEmailErrors(emailConflict);
        if (nameConflict.length === 0 && emailConflict.length === 0) {
          setFormError("No pudimos crear la cuenta: ya existe un usuario con esos datos.");
        }
      } else {
        setFormError("Ocurrió un error. Intentá de nuevo.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="font-serif text-4xl font-normal text-text">Comienza tu viaje</h2>

      <div className="flex flex-col gap-5">
        <AuthField
          label="Nombre"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          errors={nameErrors}
          onChange={(event) => setName(event.target.value)}
        />
        <AuthField
          label="Correo"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          errors={emailErrors}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthField
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          errors={passwordErrors}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordChecklist password={password} />
      </div>

      {formError && (
        <p role="alert" className="font-sans text-sm text-destructive">
          {formError}
        </p>
      )}

      <AuthSubmitButton pending={submitting} label="Crear cuenta" pendingLabel="Creando cuenta..." />

      <AuthSocialRow />
    </form>
  );
}
