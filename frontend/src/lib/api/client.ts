import type { FieldError } from "./errors";
import { ApiError } from "./errors";

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      message?: string;
      errors?: FieldError[];
    };
    return new ApiError(
      response.status,
      body.message ?? response.statusText,
      body.errors
    );
  } catch {
    return new ApiError(response.status, response.statusText);
  }
}

export function createApiClient(baseUrl: string) {
  return {
    async get<T>(endpoint: string): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseErrorResponse(response);
      }

      return response.json();
    },

    async post<T>(endpoint: string, body?: unknown): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
      });

      if (!response.ok) {
        throw await parseErrorResponse(response);
      }

      return response.json();
    },
  };
}
