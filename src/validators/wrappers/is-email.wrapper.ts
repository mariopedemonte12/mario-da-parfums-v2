import { IsEmail, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';


export function IsEmailField(code: ValidationErrorCode = ValidationErrorCode.EMAIL_INVALID_FORMAT, options?: ValidationOptions) {
    return IsEmail({}, {
        message: buildErrorMessage({ code }),
        ...options,
    });
}