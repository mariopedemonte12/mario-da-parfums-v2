import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { AllExceptionsFilter } from './http-exception.filter.js';

function createHost(json: ReturnType<typeof vi.fn>) {
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('passes through a plain HttpException message and status', () => {
    const json = vi.fn();
    const { host, status } = createHost(json);

    filter.catch(new ConflictException('Email already registered'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'Email already registered',
      }),
    );
    expect(json.mock.calls[0][0]).not.toHaveProperty('errors');
  });

  it('preserves the validation pipe errors array', () => {
    const json = vi.fn();
    const { host, status } = createHost(json);
    const errors = [
      { field: 'email', errors: [{ code: 'EMAIL_INVALID_FORMAT' }] },
    ];

    filter.catch(
      new BadRequestException({ message: 'Validation failed', errors }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        errors,
      }),
    );
  });

  it('maps a body-parser payload-too-large error to a real 413', () => {
    const json = vi.fn();
    const { host, status } = createHost(json);
    const error = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        message: 'Payload too large',
      }),
    );
  });

  it('maps an unknown error to a generic 500 without leaking its message', () => {
    const json = vi.fn();
    const { host, status } = createHost(json);

    filter.catch(new Error('db connection string leaked here'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
    const body = json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain(
      'db connection string leaked here',
    );
  });
});
