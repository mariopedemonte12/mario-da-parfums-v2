import { createApiClient } from "./client";

export const backendApi = createApiClient(
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:3000"
);

// No session/cookie concept on this service (see client.ts) — the search
// endpoint isn't behind auth.
export const queryApi = createApiClient(
  process.env.NEXT_PUBLIC_QUERY_API_URL ?? "http://localhost:8001",
  { withCredentials: false }
);