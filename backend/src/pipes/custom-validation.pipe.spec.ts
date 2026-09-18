import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { customValidationPipe } from './custom-validation.pipe.js';
import { IsRequired } from '../validators/wrappers/is-not-empty.wrapper.js';
import { IsEmailField } from '../validators/wrappers/is-email.wrapper.js';
import { MinLen } from '../validators/wrappers/is-length.wrapper.js';
import { ValidationErrorCode } from '../shared/enums/validation-error-code.enums.js';

class AddressDto {
  @IsRequired(ValidationErrorCode.FIELD_REQUIRED)
  @IsString()
  street!: string;
}

class SignupDto {
  @IsRequired(ValidationErrorCode.FIELD_REQUIRED)
  @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
  email!: string;

  // Native class-validator decorator without one of this project's JSON-message
  // wrappers, to exercise the fallback branch of parseConstraintMessage.
  @IsEmail()
  @IsOptional()
  backupEmail?: string;

  @MinLen(2, ValidationErrorCode.MIN_LENGTH)
  name!: string;

  @IsInt()
  @Type(() => Number)
  age!: number;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

const metadata: ArgumentMetadata = { type: 'body', metatype: SignupDto };

async function runTransform(value: unknown) {
  return customValidationPipe.transform(value, metadata);
}

async function runTransformExpectingFailure(value: unknown) {
  try {
    await runTransform(value);
    throw new Error('expected transform to reject');
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return err.getResponse() as {
      message: string;
      errors: { field: string; errors: { code: string }[] }[];
    };
  }
}

describe('customValidationPipe', () => {
  const validPayload = {
    email: 'user@example.com',
    name: 'Jo',
    age: '25',
    address: { street: 'Main St' },
  };

  it('passes through and transforms a fully valid payload', async () => {
    const result = (await runTransform(validPayload)) as SignupDto;

    expect(result.email).toBe('user@example.com');
    expect(result.age).toBe(25); // string "25" coerced to number via @Type
    expect(result.address).toBeInstanceOf(AddressDto);
  });

  it('strips properties not declared on the DTO (whitelist)', async () => {
    const result = (await runTransform({
      ...validPayload,
      isAdmin: true,
    })) as SignupDto & { isAdmin?: boolean };

    expect(result.isAdmin).toBeUndefined();
  });

  it('rejects with BadRequestException shaped as { message, errors } for a single failing field', async () => {
    const body = await runTransformExpectingFailure({
      ...validPayload,
      email: '',
    });

    expect(body.message).toBe('Validation failed');
    const emailError = body.errors.find((e) => e.field === 'email');
    expect(emailError).toBeDefined();
    // IsRequired fires first: whichever constraint(s) fail, each must carry
    // the project's JSON-encoded { code } shape, not a raw class-validator string.
    expect(emailError!.errors.length).toBeGreaterThan(0);
    for (const item of emailError!.errors) {
      expect(item).toHaveProperty('code');
    }
  });

  it('collects every failing constraint for a single field, not just the first', async () => {
    const body = await runTransformExpectingFailure({
      ...validPayload,
      name: '', // below MinLen(2)
    });

    const nameError = body.errors.find((e) => e.field === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: ValidationErrorCode.MIN_LENGTH }),
      ]),
    );
  });

  it('falls back to { code: rawMessage } for a native decorator without a JSON message', async () => {
    const body = await runTransformExpectingFailure({
      ...validPayload,
      backupEmail: 'not-an-email',
    });

    const backupEmailError = body.errors.find((e) => e.field === 'backupEmail');
    expect(backupEmailError).toBeDefined();
    expect(backupEmailError!.errors[0].code).toBe(
      'backupEmail must be an email',
    );
  });

  it('flattens nested ValidateNested errors into a dotted field path', async () => {
    const body = await runTransformExpectingFailure({
      ...validPayload,
      address: { street: '' },
    });

    const nestedError = body.errors.find((e) => e.field === 'address.street');
    expect(nestedError).toBeDefined();
  });

  describe('NUL byte rejection (specs/nul-byte-rejection.md)', () => {
    const NUL = String.fromCharCode(0);

    it('rejects NUL in a declared body field with CONTAINS_NUL_CHARACTER', async () => {
      const body = await runTransformExpectingFailure({
        ...validPayload,
        name: `Jo${NUL}`,
      });
      expect(body.errors).toEqual([
        { field: 'name', errors: [{ code: 'CONTAINS_NUL_CHARACTER' }] },
      ]);
    });

    it('rejects NUL in nested objects and in undeclared (whitelisted-out) fields', async () => {
      const body = await runTransformExpectingFailure({
        ...validPayload,
        address: { street: `a${NUL}` },
        extra: `b${NUL}`,
      });
      expect(body.errors.map((e) => e.field).sort()).toEqual([
        'address.street',
        'extra',
      ]);
    });

    it('reports a bare string param under the argument name', async () => {
      let caught: unknown;
      try {
        await customValidationPipe.transform(`a${NUL}b`, {
          type: 'param',
          data: 'id',
          metatype: String,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        errors: [{ field: 'id', errors: [{ code: 'CONTAINS_NUL_CHARACTER' }] }],
      });
    });

    it('takes precedence over other DTO errors', async () => {
      const body = await runTransformExpectingFailure({
        email: '',
        name: `x${NUL}`,
      });
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].errors[0].code).toBe('CONTAINS_NUL_CHARACTER');
    });
  });
});
