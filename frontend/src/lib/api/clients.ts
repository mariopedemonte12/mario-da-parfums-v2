import { createApiClient } from "./client";

export const backendApi = createApiClient(
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:3000"
);

export const queryApi = createApiClient(
  process.env.NEXT_PUBLIC_QUERY_API_URL ?? "http://localhost:8001"
);