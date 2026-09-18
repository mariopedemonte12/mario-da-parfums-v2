// validators/is-no-nul.validator.ts
import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { buildErrorMessage } from './helpers/build-error-message.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

// Postgres text/varchar cannot hold a NUL byte, so `?search=a%00b` (or any
// text filter) would reach the driver and surface as a 500. Reject it as a
// 400 instead; rejected rather than stripped so the queried value never
// silently differs from the one sent (same call as IsNotMarkup).
export function IsNoNul(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNoNul',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return true;
          return !value.includes(String.fromCharCode(0));
        },

        defaultMessage() {
          return buildErrorMessage({
            code: ValidationErrorCode.CONTAINS_NUL_CHARACTER,
          });
        },
      },
    });
  };
}
