import type { User } from "./user.types";

export type RegisterParams = {
  name: string;
  email: string;
  password: string;
};

export type LoginParams = {
  email: string;
  password: string;
};

// Assumed backend contract (see specs/auth-pages.md — cookie change not yet
// merged): the session credential travels via Set-Cookie, never in the body.
export type AuthResponse = {
  user: User;
};
