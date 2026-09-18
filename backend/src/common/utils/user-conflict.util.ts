import { ConflictException } from '@nestjs/common';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { getPgErrorCode, getPgErrorConstraint } from './pg-error.util.js';

// users.name and users.email each have their own unique constraint
// (database/schema/user.schema.ts).
export const USERS_NAME_UNIQUE_CONSTRAINT = 'users_name_unique';
export const USERS_EMAIL_UNIQUE_CONSTRAINT = 'users_email_unique';

// A 409 whose body names the colliding field in the same `errors` envelope
// the validation 400s use (docs/error-handling.md), so the frontend can put
// the message under the right input from a code instead of guessing.
// `message` stays the human-readable English text it always was.
function fieldConflict(
  message: string,
  field: string,
  code: ValidationErrorCode,
): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message,
    errors: [{ field, errors: [{ code }] }],
  });
}

export function emailConflict(): ConflictException {
  return fieldConflict(
    'Email already registered',
    'email',
    ValidationErrorCode.EMAIL_ALREADY_REGISTERED,
  );
}

export function nameConflict(): ConflictException {
  return fieldConflict(
    'Name already taken',
    'name',
    ValidationErrorCode.NAME_ALREADY_TAKEN,
  );
}

// Throws only when `err` is a 23505; otherwise returns so the caller
// rethrows the original error unchanged. An unrecognized constraint gets the
// generic message with no `errors`, so it never names a wrong field.
export function throwIfUserUniqueViolation(err: unknown): void {
  if (getPgErrorCode(err) !== '23505') return;

  switch (getPgErrorConstraint(err)) {
    case USERS_EMAIL_UNIQUE_CONSTRAINT:
      throw emailConflict();
    case USERS_NAME_UNIQUE_CONSTRAINT:
      throw nameConflict();
    default:
      throw new ConflictException(
        'A user with that name or email already exists',
      );
  }
}
