import { IsUUID, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export function IsUuidField(
  code: ValidationErrorCode = ValidationErrorCode.INVALID_TYPE,
  options?: ValidationOptions,
) {
  return IsUUID('4', {
    message: buildErrorMessage({ code }),
    ...options,
  });
}
