import { ValidationErrorItem } from '../../shared/validation-codes.js';

export function buildErrorMessage(
  items: ValidationErrorItem | ValidationErrorItem[],
): string {
  const payload = Array.isArray(items) ? items : [items];
  return JSON.stringify(payload);
}
