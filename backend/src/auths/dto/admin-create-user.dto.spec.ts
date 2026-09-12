import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminCreateUserDto } from './admin-create-user.dto.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { Role } from '../../shared/enums/role.enums.js';

const VALID_PAYLOAD = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'Str0ng!Pass',
  role: Role.USER,
};

async function codesForField(
  payload: Record<string, unknown>,
  field: string,
): Promise<string[]> {
  const dto = plainToInstance(AdminCreateUserDto, payload);
  const errors = await validate(dto);
  const fieldError = errors.find((e) => e.property === field);
  if (!fieldError) return [];
  const messages = Object.values(fieldError.constraints ?? {});
  return messages.flatMap((message) =>
    (JSON.parse(message) as { code: string }[]).map((i) => i.code),
  );
}

describe('AdminCreateUserDto', () => {
  it('accepts a fully populated valid payload', async () => {
    const dto = plainToInstance(AdminCreateUserDto, VALID_PAYLOAD);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts role: admin — this is the one field public RegisterDto forbids', async () => {
    const dto = plainToInstance(AdminCreateUserDto, {
      ...VALID_PAYLOAD,
      role: Role.ADMIN,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  describe('name', () => {
    it('is required: missing fails with NAME_REQUIRED', async () => {
      const { name: _name, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'name')).toEqual(
        expect.arrayContaining([ValidationErrorCode.NAME_REQUIRED]),
      );
    });

    it('is required: empty string fails with NAME_REQUIRED', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, name: '' }, 'name'),
      ).toEqual([ValidationErrorCode.NAME_REQUIRED]);
    });

    it('rejects a non-string value with NAME_INVALID_TYPE', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, name: 123 }, 'name'),
      ).toEqual([ValidationErrorCode.NAME_INVALID_TYPE]);
    });
  });

  describe('email', () => {
    it('is required: missing fails with EMAIL_REQUIRED', async () => {
      const { email: _email, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'email')).toEqual(
        expect.arrayContaining([ValidationErrorCode.EMAIL_REQUIRED]),
      );
    });

    it('rejects a malformed email with EMAIL_INVALID_FORMAT', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, email: 'not-an-email' },
          'email',
        ),
      ).toEqual([ValidationErrorCode.EMAIL_INVALID_FORMAT]);
    });
  });

  describe('password', () => {
    it('is required: missing fails with PASSWORD_REQUIRED', async () => {
      const { password: _password, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'password')).toEqual(
        expect.arrayContaining([ValidationErrorCode.PASSWORD_REQUIRED]),
      );
    });

    it('rejects a weak password (plain text, not a hash — same rules as RegisterDto)', async () => {
      const errors = await codesForField(
        { ...VALID_PAYLOAD, password: 'weak' },
        'password',
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts a password at the 8-char minimum length boundary, given the other strength rules', async () => {
      // "Str0ng!P" = 8 chars, upper+lower+digit+special.
      expect(
        await codesForField({ ...VALID_PAYLOAD, password: 'Str0ng!P' }, 'password'),
      ).toEqual([]);
    });

    it('rejects a password one character under the 8-char minimum', async () => {
      // "Str0ng!" = 7 chars.
      const errors = await codesForField(
        { ...VALID_PAYLOAD, password: 'Str0ng!' },
        'password',
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('role', () => {
    it('is required: missing fails validation (no @IsOptional/@IsRequired — IsEnum rejects undefined)', async () => {
      const { role: _role, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'role')).toEqual([
        ValidationErrorCode.ROLE_INVALID,
      ]);
    });

    it('rejects a value outside the Role enum with ROLE_INVALID', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, role: 'superadmin' }, 'role'),
      ).toEqual([ValidationErrorCode.ROLE_INVALID]);
    });
  });
});
