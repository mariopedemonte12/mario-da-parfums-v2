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

// `credentials: "include"` is what lets a request carry the auth session
// cookie cross-origin (this app has no BFF layer, see frontend/CLAUDE.md).
// Only pass `withCredentials: false` for a client whose target has no
// session concept at all (e.g. similarityServer's queryApi) — sending
// "include" there gets requests blocked by CORS unless that server also
// opts into `Access-Control-Allow-Credentials`, which it has no reason to.
export function createApiClient(baseUrl: string, options?: { withCredentials?: boolean }) {
  const credentials: RequestCredentials = options?.withCredentials === false ? "omit" : "include";

  return {
    async get<T>(endpoint: string): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        credentials,
      });

      if (!response.ok) {
        throw await parseErrorResponse(response);
      }

      return response.json();
    },

    async post<T>(endpoint: string, body?: unknown): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        credentials,
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

    async delete<T>(endpoint: string, body?: unknown): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "DELETE",
        credentials,
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
