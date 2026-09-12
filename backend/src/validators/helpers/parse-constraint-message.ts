import { ValidationErrorItem } from '../../shared/validation-codes.js';

// Inverse of buildErrorMessage(): a class-validator constraint message is
// either JSON (one or more { code, meta? } items, produced by the wrapper
// decorators in ../wrappers) or, for a native class-validator decorator not
// yet migrated to a code (@IsEmail, @IsNotEmpty, etc.), plain text — sent
// through as-is as the "code". Shared by customValidationPipe and any
// service that validates DTO instances outside the global pipe.
export function parseConstraintMessage(message: string): ValidationErrorItem[] {
  try {
    const parsed = JSON.parse(message);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [{ code: message }];
  }
}
