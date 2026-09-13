import { backendApi } from "@/lib/api/clients";

import type { User } from "../types/user.types";
import type { RegisterParams } from "../types/auth.types";

export async function register(
  params: RegisterParams
): Promise<User> {
  return backendApi.post<User>("/auth/register", params);
}