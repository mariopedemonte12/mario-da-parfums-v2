"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { login as loginRequest, register as registerRequest } from "../api/auth.api";
import type { LoginParams, RegisterParams } from "../types/auth.types";
import type { User } from "../types/user.types";

type AuthContextValue = {
  user: User | null;
  login: (params: LoginParams) => Promise<User>;
  register: (params: RegisterParams) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  async function login(params: LoginParams): Promise<User> {
    const loggedInUser = await loginRequest(params);
    setUser(loggedInUser);
    return loggedInUser;
  }

  async function register(params: RegisterParams): Promise<User> {
    const registeredUser = await registerRequest(params);
    setUser(registeredUser);
    return registeredUser;
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
