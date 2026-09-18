import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import {
  emailConflict,
  nameConflict,
  throwIfUserUniqueViolation,
} from './user-conflict.util.js';

function catchConflict(fn: () => void): ConflictException {
  try {
    fn();
  } catch (err) {
    return err as ConflictException;
  }
  throw new Error('expected a throw');
}

describe('user-conflict.util', () => {
  it('emailConflict names the email field with EMAIL_ALREADY_REGISTERED', () => {
    expect(emailConflict().getResponse()).toMatchObject({
      message: 'Email already registered',
      errors: [
        {
          field: 'email',
          errors: [{ code: ValidationErrorCode.EMAIL_ALREADY_REGISTERED }],
        },
      ],
    });
  });

  it('nameConflict names the name field with NAME_ALREADY_TAKEN', () => {
    expect(nameConflict().getResponse()).toMatchObject({
      message: 'Name already taken',
      errors: [
        {
          field: 'name',
          errors: [{ code: ValidationErrorCode.NAME_ALREADY_TAKEN }],
        },
      ],
    });
  });

  describe('throwIfUserUniqueViolation', () => {
    it('maps users_email_unique to the email conflict', () => {
      const err = catchConflict(() =>
        throwIfUserUniqueViolation({
          code: '23505',
          constraint: 'users_email_unique',
        }),
      );
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse()).toMatchObject({
        errors: [{ field: 'email' }],
      });
    });

    it('maps users_name_unique to the name conflict, also through drizzle .cause wrapping', () => {
      const wrapped = new Error('query failed', {
        cause: { code: '23505', constraint: 'users_name_unique' },
      });
      const err = catchConflict(() => throwIfUserUniqueViolation(wrapped));
      expect(err.getResponse()).toMatchObject({
        message: 'Name already taken',
        errors: [{ field: 'name' }],
      });
    });

    it.each([
      [{ code: '23505' }],
      [{ code: '23505', constraint: 'users_something_else' }],
    ])('unknown constraint %o gives a generic 409 with no field', (pgErr) => {
      const err = catchConflict(() => throwIfUserUniqueViolation(pgErr));
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse()).not.toHaveProperty('errors');
      expect(err.message).toBe(
        'A user with that name or email already exists',
      );
    });

    it('does nothing for a non-23505 error', () => {
      expect(() => throwIfUserUniqueViolation({ code: '23503' })).not.toThrow();
      expect(() => throwIfUserUniqueViolation(new Error('x'))).not.toThrow();
    });
  });
});
