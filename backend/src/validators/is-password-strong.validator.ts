import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { buildErrorMessage } from './helpers/build-error-message.js';
import { PasswordErrorCode } from '../shared/enums/password-error-code.enums.js';

const MIN_LENGTH = 8;

function checkPasswordRules(value: string) {
  return {
    [PasswordErrorCode.MIN_LENGTH]: {
      valid: value.length >= MIN_LENGTH,
      meta: { min: MIN_LENGTH, actual: value.length },
    },
    [PasswordErrorCode.UPPERCASE]: { valid: /[A-Z]/.test(value) },
    [PasswordErrorCode.LOWERCASE]: { valid: /[a-z]/.test(value) },
    [PasswordErrorCode.NUMBER]: { valid: /\d/.test(value) },
    [PasswordErrorCode.SPECIAL_CHAR]: { valid: /[^A-Za-z0-9]/.test(value) },
  };
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          return Object.values(checkPasswordRules(value)).every((r) => r.valid);
        },

        defaultMessage(args: ValidationArguments) {
          const value = args.value;

          if (typeof value !== 'string') {
            return buildErrorMessage({ code: PasswordErrorCode.NOT_STRING });
          }

          const rules = checkPasswordRules(value);
          const failed = Object.entries(rules)
            .filter(([, r]) => !r.valid)
            .map(([code, r]) => ({
              code,
              meta: 'meta' in r ? r.meta : undefined,
            }));

          return buildErrorMessage(failed);
        },
      },
    });
  };
}
