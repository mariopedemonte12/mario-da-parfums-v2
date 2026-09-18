"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../hooks/useAuth";
import AuthField from "./AuthField";
import AuthSubmitButton from "./AuthSubmitButton";
import AuthSocialRow from "./AuthSocialRow";
import PasswordChecklist from "./PasswordChecklist";
import { mapRegisterError } from "../utils/registerErrors";

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
      const mapped = mapRegisterError(err);
      setNameErrors(mapped.name);
      setEmailErrors(mapped.email);
      setPasswordErrors(mapped.password);
      setFormError(mapped.form);
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
