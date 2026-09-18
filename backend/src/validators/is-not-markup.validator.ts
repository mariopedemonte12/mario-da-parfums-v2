// validators/is-not-markup.validator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { buildErrorMessage } from './helpers/build-error-message.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

// `<`/`>` are rejected outright rather than stripped: this is stored,
// user-supplied free text with no legitimate need for markup, and a silent
// strip can surprise a caller (submitted text differs from what's saved)
// where a 400 doesn't — same call IsNotProfane already made.
const MARKUP_PATTERN = /[<>]/;

export function IsNotMarkup(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotMarkup',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return true;
          return !MARKUP_PATTERN.test(value);
        },

        defaultMessage(args: ValidationArguments) {
          if (typeof args.value !== 'string') {
            return buildErrorMessage({
              code: ValidationErrorCode.INVALID_TYPE,
            });
          }

          return buildErrorMessage({
            code: ValidationErrorCode.CONTAINS_MARKUP,
          });
        },
      },
    });
  };
}
