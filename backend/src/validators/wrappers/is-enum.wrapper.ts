import { IsEnum, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export function IsEnumField(
  entity: object,
  code: ValidationErrorCode = ValidationErrorCode.INVALID_ENUM_VALUE,
  options?: ValidationOptions,
) {
  return IsEnum(entity, {
    message: (args) =>
      buildErrorMessage({
        code,
        meta: { allowed: Object.values(entity), actual: args.value },
      }),
    ...options,
  });
}
