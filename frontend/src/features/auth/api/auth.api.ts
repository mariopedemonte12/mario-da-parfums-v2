import { backendApi } from "@/lib/api/clients";

import type { AuthResponse, LoginParams, RegisterParams } from "../types/auth.types";

export async function register(params: RegisterParams): Promise<AuthResponse> {
  return backendApi.post<AuthResponse>("/auths/register", params);
}

export async function login(params: LoginParams): Promise<AuthResponse> {
  return backendApi.post<AuthResponse>("/auths/login", params);
}

export async function logout(): Promise<void> {
  await backendApi.post<void>("/auths/logout");
}
