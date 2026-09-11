import { MinLength, MaxLength, ValidationOptions } from 'class-validator';
import { buildErrorMessage } from '../helpers/build-error-message.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';


export function MinLen(min: number, code: ValidationErrorCode = ValidationErrorCode.MIN_LENGTH, options?: ValidationOptions) {
    return MinLength(min, {
        message: (args) => buildErrorMessage({
            code,
            meta: { min, actual: args.value?.length },
        }),
        ...options,
    });
}

export function MaxLen(max: number, code: ValidationErrorCode = ValidationErrorCode.MAX_LENGTH, options?: ValidationOptions) {
    return MaxLength(max, {
        message: (args) => buildErrorMessage({
            code,
            meta: { max, actual: args.value?.length },
        }),
        ...options,
    });
}