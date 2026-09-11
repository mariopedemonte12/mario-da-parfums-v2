// Formas compartidas por customValidationPipe y AllExceptionsFilter.
// Los códigos en sí viven en src/shared/enums (ValidationErrorCode, PasswordErrorCode).
export interface ValidationErrorItem {
  code: string;
  meta?: Record<string, any>;
}

export interface FieldError {
  field: string;
  errors: ValidationErrorItem[];
}
