import { ValidationArguments } from 'class-validator';
import { buildErrorMessage } from './build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export function msg(
  code: ValidationErrorCode,
  metaFn?: (args: ValidationArguments) => Record<string, any>,
) {
  return (args: ValidationArguments) =>
    buildErrorMessage({
      code,
      meta: metaFn ? metaFn(args) : undefined,
    });
}
