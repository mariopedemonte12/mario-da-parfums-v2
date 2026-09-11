import { IsNotEmpty, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';


export function IsRequired(code: ValidationErrorCode = ValidationErrorCode.FIELD_REQUIRED, options?: ValidationOptions) {
    return IsNotEmpty({
        message: buildErrorMessage({ code }),
        ...options,
    });
}