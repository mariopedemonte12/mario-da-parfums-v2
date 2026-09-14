// Mirrors the backend's error envelope (backend/docs/error-handling.md):
// every non-OK response is { statusCode, message, errors?: FieldError[] }.
export type ValidationErrorItem = {
  code: string;
  meta?: Record<string, unknown>;
};

export type FieldError = {
  field: string;
  errors: ValidationErrorItem[];
};

export class ApiError extends Error {
  statusCode: number;
  errors?: FieldError[];

  constructor(statusCode: number, message: string, errors?: FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }

  fieldError(field: string): FieldError | undefined {
    return this.errors?.find((e) => e.field === field);
  }
}
