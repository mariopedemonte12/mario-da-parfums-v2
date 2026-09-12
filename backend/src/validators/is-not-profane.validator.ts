// validators/is-not-profane.validator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { buildErrorMessage } from './helpers/build-error-message.js';
import { leoProfanity } from './config/profanity.config.js';
import { normalizeForProfanityCheck } from './helpers/normalize-text.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

export function IsNotProfane(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNotProfane',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return true;
          const normalized = normalizeForProfanityCheck(value);
          return !leoProfanity.check(normalized);
        },

        defaultMessage(args: ValidationArguments) {
          const value = args.value;

          if (typeof value !== 'string') {
            return buildErrorMessage({
              code: ValidationErrorCode.INVALID_TYPE,
            });
          }

          const badWords = leoProfanity
            .list()
            .filter((word) => value.toLowerCase().includes(word));

          return buildErrorMessage({
            code: ValidationErrorCode.CONTAINS_PROFANITY,
          });
        },
      },
    });
  };
}
