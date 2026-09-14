"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api/errors";
import { useAuth } from "../hooks/useAuth";
import AuthField from "./AuthField";
import AuthSubmitButton from "./AuthSubmitButton";
import AuthSocialRow from "./AuthSocialRow";

export default function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      router.push("/");
    } catch (err) {
      // Backend deliberately returns the same 401 for "no such email" and
      // "wrong password" (enumeration prevention, see backend/src/auths/NOTES.md)
      // — one generic message, never per-field.
      if (err instanceof ApiError && err.statusCode === 401) {
        setFormError("Correo o contraseña incorrectos.");
      } else {
        setFormError("Ocurrió un error. Intentá de nuevo.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="font-serif text-4xl font-normal text-text">Bienvenida de vuelta</h2>

      <div className="flex flex-col gap-5">
        <AuthField
          label="Correo"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthField
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between font-sans text-[13px] font-light text-text-muted">
        <label className="flex items-center gap-2">
          <input type="checkbox" disabled className="accent-primary" />
          Recordarme
        </label>
        <span className="cursor-not-allowed underline decoration-border" title="Todavía no disponible">
          Olvidé mi contraseña
        </span>
      </div>

      {formError && (
        <p role="alert" className="font-sans text-sm text-destructive">
          {formError}
        </p>
      )}

      <AuthSubmitButton pending={submitting} label="Entrar" pendingLabel="Entrando..." />

      <AuthSocialRow />
    </form>
  );
}
