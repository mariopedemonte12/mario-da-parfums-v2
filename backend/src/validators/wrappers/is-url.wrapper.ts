import { IsUrl, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export function IsUrlField(
  code: ValidationErrorCode = ValidationErrorCode.INVALID_TYPE,
  options?: ValidationOptions,
) {
  return IsUrl(
    { require_tld: true, protocols: ['http', 'https'], require_protocol: true },
    {
      message: buildErrorMessage({ code }),
      ...options,
    },
  );
}
