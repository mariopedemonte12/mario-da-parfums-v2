import { describe, expect, it } from "vitest";

import { ApiError, type FieldError } from "@/lib/api/errors";
import {
  mapRegisterError,
  REGISTER_CONFLICT_MESSAGE,
  REGISTER_GENERIC_MESSAGE,
} from "./registerErrors";

// Source of truth: specs/register-conflict-errors.md ("Frontend (/register)")
// and specs/auth-pages.md.

const field = (name: string, ...codes: (string | [string, Record<string, unknown>])[]): FieldError => ({
  field: name,
  errors: codes.map((c) => (typeof c === "string" ? { code: c } : { code: c[0], meta: c[1] })),
});

const empty = { name: [], email: [], password: [], form: null };

describe("mapRegisterError - 409 (decision table: email field x name field)", () => {
  it("email only -> email message, nothing else", () => {
    const err = new ApiError(409, "Email already registered", [field("email", "EMAIL_ALREADY_REGISTERED")]);
    expect(mapRegisterError(err)).toEqual({ ...empty, email: ["Ese correo ya está registrado."] });
  });

  it("name only -> name message, nothing else", () => {
    const err = new ApiError(409, "Name already taken", [field("name", "NAME_ALREADY_TAKEN")]);
    expect(mapRegisterError(err)).toEqual({ ...empty, name: ["Ese nombre ya está en uso."] });
  });

  it("both fields -> both messages, no general message", () => {
    const err = new ApiError(409, "x", [
      field("name", "NAME_ALREADY_TAKEN"),
      field("email", "EMAIL_ALREADY_REGISTERED"),
    ]);
    expect(mapRegisterError(err)).toEqual({
      ...empty,
      name: ["Ese nombre ya está en uso."],
      email: ["Ese correo ya está registrado."],
    });
  });

  it("neither (errors absent) -> general message, no field attribution", () => {
    const err = new ApiError(409, "A user with that name or email already exists");
    expect(mapRegisterError(err)).toEqual({ ...empty, form: REGISTER_CONFLICT_MESSAGE });
  });

  it("neither (errors empty array) -> general message", () => {
    expect(mapRegisterError(new ApiError(409, "x", []))).toEqual({ ...empty, form: REGISTER_CONFLICT_MESSAGE });
  });

  it("errors only for unrelated fields (password) -> general message, password not attributed", () => {
    const err = new ApiError(409, "x", [field("password", "PASSWORD_REQUIRED")]);
    expect(mapRegisterError(err)).toEqual({ ...empty, form: REGISTER_CONFLICT_MESSAGE });
  });

  it("field entry with an empty errors list counts as no conflict -> general message", () => {
    const err = new ApiError(409, "x", [field("email")]);
    expect(mapRegisterError(err)).toEqual({ ...empty, form: REGISTER_CONFLICT_MESSAGE });
  });

  it("unknown code for a named field falls back to the server message under that field, no general message", () => {
    const err = new ApiError(409, "Server said this", [field("email", "SOMETHING_NEW")]);
    expect(mapRegisterError(err)).toEqual({ ...empty, email: ["Server said this"] });
  });

  it("conflict message is the spec's Spanish text", () => {
    expect(REGISTER_CONFLICT_MESSAGE).toBe("No pudimos crear la cuenta: ya existe un usuario con esos datos.");
  });
});

describe("mapRegisterError - 400", () => {
  it("maps each field independently", () => {
    const err = new ApiError(400, "Bad Request", [
      field("name", "NAME_REQUIRED"),
      field("email", "EMAIL_INVALID_FORMAT"),
      field("password", "PASSWORD_UPPERCASE", "PASSWORD_NUMBER"),
    ]);
    expect(mapRegisterError(err)).toEqual({
      name: ["El nombre es obligatorio."],
      email: ["Ingresá un correo válido."],
      password: ["Al menos una mayúscula.", "Al menos un número."],
      form: null,
    });
  });

  it.each([
    ["NAME_REQUIRED", "name", "El nombre es obligatorio."],
    ["NAME_INVALID_TYPE", "name", "El nombre no es válido."],
    ["NAME_ALREADY_TAKEN", "name", "Ese nombre ya está en uso."],
    ["CONTAINS_PROFANITY", "name", "Este texto no está permitido."],
    ["EMAIL_REQUIRED", "email", "El correo es obligatorio."],
    ["EMAIL_INVALID_FORMAT", "email", "Ingresá un correo válido."],
    ["EMAIL_ALREADY_REGISTERED", "email", "Ese correo ya está registrado."],
    ["PASSWORD_REQUIRED", "password", "La contraseña es obligatoria."],
    ["PASSWORD_INVALID_TYPE", "password", "La contraseña no es válida."],
    ["PASSWORD_NOT_STRING", "password", "La contraseña no es válida."],
    ["PASSWORD_UPPERCASE", "password", "Al menos una mayúscula."],
    ["PASSWORD_LOWERCASE", "password", "Al menos una minúscula."],
    ["PASSWORD_NUMBER", "password", "Al menos un número."],
    ["PASSWORD_SPECIAL_CHAR", "password", "Al menos un carácter especial."],
  ] as const)("%s on %s -> %s", (code, fieldName, message) => {
    const result = mapRegisterError(new ApiError(400, "Bad Request", [field(fieldName, code)]));
    expect(result[fieldName]).toEqual([message]);
    expect(result.form).toBeNull();
  });

  it("PASSWORD_MIN_LENGTH uses meta.min", () => {
    const err = new ApiError(400, "x", [field("password", ["PASSWORD_MIN_LENGTH", { min: 12 }])]);
    expect(mapRegisterError(err).password).toEqual(["Mínimo 12 caracteres."]);
  });

  it("PASSWORD_MIN_LENGTH defaults to 8 without meta or with a nullish min", () => {
    expect(mapRegisterError(new ApiError(400, "x", [field("password", "PASSWORD_MIN_LENGTH")])).password).toEqual([
      "Mínimo 8 caracteres.",
    ]);
    expect(
      mapRegisterError(new ApiError(400, "x", [field("password", ["PASSWORD_MIN_LENGTH", {}])])).password,
    ).toEqual(["Mínimo 8 caracteres."]);
  });

  it("unknown code falls back to the response message", () => {
    const err = new ApiError(400, "Server message", [field("name", "BRAND_NEW_CODE")]);
    expect(mapRegisterError(err).name).toEqual(["Server message"]);
  });

  it("400 without errors[] shows nothing (no general message, unchanged behavior)", () => {
    expect(mapRegisterError(new ApiError(400, "Bad Request"))).toEqual(empty);
  });

  it("ignores errors for fields the form doesn't have", () => {
    expect(mapRegisterError(new ApiError(400, "x", [field("age", "SOMETHING")]))).toEqual(empty);
  });
});

describe("mapRegisterError - everything else -> generic message", () => {
  it.each([401, 403, 404, 429, 500, 503])("ApiError %i", (status) => {
    expect(mapRegisterError(new ApiError(status, "x", [field("email", "EMAIL_ALREADY_REGISTERED")]))).toEqual({
      ...empty,
      form: REGISTER_GENERIC_MESSAGE,
    });
  });

  it("boundary: 399/410 neighbours of 400/409 are generic too", () => {
    expect(mapRegisterError(new ApiError(410, "x")).form).toBe(REGISTER_GENERIC_MESSAGE);
    expect(mapRegisterError(new ApiError(408, "x")).form).toBe(REGISTER_GENERIC_MESSAGE);
  });

  it("network failure (TypeError)", () => {
    expect(mapRegisterError(new TypeError("Failed to fetch"))).toEqual({ ...empty, form: REGISTER_GENERIC_MESSAGE });
  });

  it.each([undefined, null, "boom", 42, {}])("non-Error value %j", (value) => {
    expect(mapRegisterError(value)).toEqual({ ...empty, form: REGISTER_GENERIC_MESSAGE });
  });

  it("a plain object that looks like an ApiError is not treated as one", () => {
    expect(mapRegisterError({ statusCode: 409, errors: [field("email", "EMAIL_ALREADY_REGISTERED")] }).form).toBe(
      REGISTER_GENERIC_MESSAGE,
    );
  });
});
