// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import RegisterForm from "./RegisterForm";

// specs/register-conflict-errors.md, "Frontend (/register)": a 409 is shown under
// the field it names, or as a general message when it names none.

const push = vi.fn();
const register = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ register }) }));

async function submitWith(error: ApiError) {
  register.mockRejectedValue(error);
  const user = userEvent.setup();
  render(<RegisterForm />);
  await user.type(screen.getByLabelText("Nombre"), "Mario");
  await user.type(screen.getByLabelText("Correo"), "mario@example.com");
  await user.type(screen.getByLabelText("Contraseña"), "Abcdef1!");
  await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

// The message list rendered by AuthField sits in the same wrapper as its input.
function messagesFor(label: string): string[] {
  const wrapper = screen.getByLabelText(label).parentElement as HTMLElement;
  return within(wrapper)
    .queryAllByRole("listitem")
    .map((li) => li.textContent ?? "");
}

beforeEach(() => {
  push.mockReset();
  register.mockReset();
});

afterEach(cleanup);

describe("RegisterForm 409 handling", () => {
  it("email conflict appears under the email field only", async () => {
    await submitWith(
      new ApiError(409, "Email already registered", [
        { field: "email", errors: [{ code: "EMAIL_ALREADY_REGISTERED" }] },
      ]),
    );
    expect(await screen.findByText("Ese correo ya está registrado.")).toBeTruthy();
    expect(messagesFor("Correo")).toEqual(["Ese correo ya está registrado."]);
    expect(messagesFor("Nombre")).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("name conflict appears under the name field only", async () => {
    await submitWith(
      new ApiError(409, "Name already taken", [{ field: "name", errors: [{ code: "NAME_ALREADY_TAKEN" }] }]),
    );
    expect(await screen.findByText("Ese nombre ya está en uso.")).toBeTruthy();
    expect(messagesFor("Nombre")).toEqual(["Ese nombre ya está en uso."]);
    expect(messagesFor("Correo")).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an unknown 409 shows the general message and no field error", async () => {
    await submitWith(new ApiError(409, "A user with that name or email already exists"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No pudimos crear la cuenta: ya existe un usuario con esos datos.");
    expect(messagesFor("Nombre")).toEqual([]);
    expect(messagesFor("Correo")).toEqual([]);
  });
});
