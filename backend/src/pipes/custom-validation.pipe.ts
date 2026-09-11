// pipes/custom-validation.pipe.ts
import { ValidationPipe, ValidationError, BadRequestException } from '@nestjs/common';
import { FieldError, ValidationErrorItem } from '../shared/validation-codes.js';

function parseConstraintMessage(message: string): ValidationErrorItem[] {
    try {
        const parsed = JSON.parse(message);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        // Fallback: decoradores nativos de class-validator (@IsEmail, @IsNotEmpty, etc.)
        // que no fueron migrados a código todavía -> se envía el mensaje tal cual como "code"
        return [{ code: message }];
    }
}

function flattenErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
    const result: FieldError[] = [];

    for (const err of errors) {
        const path = parentPath ? `${parentPath}.${err.property}` : err.property;

        if (err.constraints) {
            const items = Object.values(err.constraints).flatMap(parseConstraintMessage);
            result.push({ field: path, errors: items });
        }

        // Soporte para DTOs anidados (ValidateNested)
        if (err.children && err.children.length > 0) {
            result.push(...flattenErrors(err.children, path));
        }
    }

    return result;
}

export const customValidationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
        const formatted = flattenErrors(errors);

        return new BadRequestException({
            message: 'Validation failed',
            errors: formatted,
        });
    },
});