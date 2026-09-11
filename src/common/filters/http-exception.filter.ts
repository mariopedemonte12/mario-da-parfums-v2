import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { FieldError } from '../../shared/validation-codes.js';

interface ErrorResponseBody {
    statusCode: number;
    message: string;
    errors?: FieldError[];
    timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const response = host.switchToHttp().getResponse<Response>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();

            const { message, errors } =
                typeof body === 'string'
                    ? { message: body, errors: undefined }
                    : {
                          message: (body as { message?: string }).message ?? exception.message,
                          errors: (body as { errors?: FieldError[] }).errors,
                      };

            const payload: ErrorResponseBody = {
                statusCode: status,
                message,
                ...(errors ? { errors } : {}),
                timestamp: new Date().toISOString(),
            };

            response.status(status).json(payload);
            return;
        }

        this.logger.error(
            exception instanceof Error ? exception.message : String(exception),
            exception instanceof Error ? exception.stack : undefined,
        );

        const payload: ErrorResponseBody = {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
            timestamp: new Date().toISOString(),
        };

        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
    }
}
