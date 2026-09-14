import { backendApi } from "@/lib/api/clients";

import type { User } from "../types/user.types";
import type { LoginParams, RegisterParams } from "../types/auth.types";

export async function register(
  params: RegisterParams
): Promise<User> {
  const { user } = await backendApi.post<{ user: User }>(
    "/auths/register",
    params
  );
  return user;
}

export async function login(
  params: LoginParams
): Promise<User> {
  const { user } = await backendApi.post<{ user: User }>(
    "/auths/login",
    params
  );
  return user;
}
