import { IsString, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';


export function IsStringField(code: ValidationErrorCode = ValidationErrorCode.INVALID_TYPE, options?: ValidationOptions) {
    return IsString({
        message: buildErrorMessage({ code }),
        ...options,
    });
}