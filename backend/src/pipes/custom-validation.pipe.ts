// pipes/custom-validation.pipe.ts
import {
  ArgumentMetadata,
  ValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';
import { findNulPaths } from '../validators/helpers/find-nul-paths.js';
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

function nulRejection(paths: string[], metadata: ArgumentMetadata) {
  // A bare @Param('id')/@Query('q') string is itself the offender (path
  // ''), so the field is the declared argument name.
  const errors: FieldError[] = paths.map((path) => ({
    field: path || metadata.data || metadata.type,
    errors: [{ code: ValidationErrorCode.CONTAINS_NUL_CHARACTER }],
  }));
  return new BadRequestException({ message: 'Validation failed', errors });
}

// Rejects a NUL byte in ANY string of body/query/param before DTO
// validation, so no DTO (present or future) can forget it and let Postgres
// turn it into a 500. See validators/NOTES.md, specs/nul-byte-rejection.md.
class NulRejectingValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'custom') {
      const paths = findNulPaths(value);
      if (paths.length > 0) throw nulRejection(paths, metadata);
    }
    return super.transform(value, metadata);
  }
}

export const customValidationPipe = new NulRejectingValidationPipe({
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
