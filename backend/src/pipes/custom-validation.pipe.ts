// pipes/custom-validation.pipe.ts
import {
  ValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';
import { FieldError } from '../shared/validation-codes.js';
import { parseConstraintMessage } from '../validators/helpers/parse-constraint-message.js';

function flattenErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const result: FieldError[] = [];

  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;

    if (err.constraints) {
      const items = Object.values(err.constraints).flatMap(
        parseConstraintMessage,
      );
      result.push({ field: path, errors: items });
    }

    // Soporte para DTOs anidados (ValidateNested)
    if (err.children && err.children.length > 0) {
      result.push(...flattenErrors(err.children, path));
    }
  }

  return result;
}

export const customValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: (errors: ValidationError[]) => {
    const formatted = flattenErrors(errors);

    return new BadRequestException({
      message: 'Validation failed',
      errors: formatted,
    });
  },
});
