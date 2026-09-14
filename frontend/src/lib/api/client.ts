export class ApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`API error: ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export function createApiClient(baseUrl: string) {
  return {
    async get<T>(endpoint: string): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`);

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return response.json();
    },

    async post<T>(endpoint: string, body: unknown): Promise<T> {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return response.json();
    },
  };
}