import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

async function codesForField(
  payload: Record<string, unknown>,
  field: string,
): Promise<string[]> {
  const dto = plainToInstance(UpdateUserDto, payload);
  const errors = await validate(dto);
  const fieldError = errors.find((e) => e.property === field);
  if (!fieldError) return [];
  const messages = Object.values(fieldError.constraints ?? {});
  return messages.flatMap((message) =>
    (JSON.parse(message) as { code: string }[]).map((i) => i.code),
  );
}

describe('UpdateUserDto', () => {
  it('accepts an empty payload — every field is optional', async () => {
    const dto = plainToInstance(UpdateUserDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a fully populated valid payload', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      name: 'Jane Doe',
      email: 'jane@example.com',
      photoS3Key: 'users/avatars/1.jpg',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  // Neither role nor password has a validator decorator on this class, so
  // sending them produces no *validation* error either way — that's
  // expected, not a gap: it's the global pipe's whitelist:true (not
  // class-validator's validate() used here) that actually strips undeclared
  // properties before they reach the service. That's the real security
  // boundary this feature's fix relies on, and it's exercised end-to-end at
  // the HTTP layer in users.controller.spec.ts ("role/password stripped").

  describe('name (optional)', () => {
    it('passes when omitted', async () => {
      expect(await codesForField({}, 'name')).toEqual([]);
    });

    it('rejects a non-string value with NAME_INVALID_TYPE', async () => {
      expect(await codesForField({ name: 123 }, 'name')).toEqual([
        ValidationErrorCode.NAME_INVALID_TYPE,
      ]);
    });
  });

  describe('email (optional)', () => {
    it('passes when omitted', async () => {
      expect(await codesForField({}, 'email')).toEqual([]);
    });

    it('rejects a malformed email with EMAIL_INVALID_FORMAT', async () => {
      expect(
        await codesForField({ email: 'not-an-email' }, 'email'),
      ).toEqual([ValidationErrorCode.EMAIL_INVALID_FORMAT]);
    });

    it('accepts a well-formed email', async () => {
      expect(
        await codesForField({ email: 'jane@example.com' }, 'email'),
      ).toEqual([]);
    });
  });

  // Security-hardening: stored-XSS payloads in free-text fields, per
  // specs/security-hardening.md §5.
  describe('markup rejection (name/email)', () => {
    it('rejects a <script> tag in name with CONTAINS_MARKUP', async () => {
      expect(
        await codesForField({ name: '<script>alert(1)</script>' }, 'name'),
      ).toEqual(expect.arrayContaining([ValidationErrorCode.CONTAINS_MARKUP]));
    });

    it('rejects an <img onerror=...> tag in name with CONTAINS_MARKUP', async () => {
      expect(
        await codesForField(
          { name: '<img src=x onerror=alert(1)>' },
          'name',
        ),
      ).toEqual(expect.arrayContaining([ValidationErrorCode.CONTAINS_MARKUP]));
    });
  });

  describe('photoS3Key (optional)', () => {
    it('passes when omitted', async () => {
      expect(await codesForField({}, 'photoS3Key')).toEqual([]);
    });

    it('rejects a non-string value with PHOTO_S3_KEY_INVALID_TYPE', async () => {
      expect(
        await codesForField({ photoS3Key: 123 }, 'photoS3Key'),
      ).toEqual(
        expect.arrayContaining([ValidationErrorCode.PHOTO_S3_KEY_INVALID_TYPE]),
      );
    });

    describe('length boundary (MaxLen 255)', () => {
      it('accepts the boundary value, 255 chars', async () => {
        expect(
          await codesForField({ photoS3Key: 'a'.repeat(255) }, 'photoS3Key'),
        ).toEqual([]);
      });

      it('rejects the neighbor above the boundary, 256 chars, with PHOTO_S3_KEY_TOO_LONG', async () => {
        expect(
          await codesForField({ photoS3Key: 'a'.repeat(256) }, 'photoS3Key'),
        ).toEqual(
          expect.arrayContaining([ValidationErrorCode.PHOTO_S3_KEY_TOO_LONG]),
        );
      });
    });

    describe('charset (valid S3 object-key characters only)', () => {
      it('accepts the documented valid charset', async () => {
        expect(
          await codesForField(
            { photoS3Key: "users/avatars/1_A-Z.a'z().jpg" },
            'photoS3Key',
          ),
        ).toEqual([]);
      });

      it('rejects a query string character (?) with PHOTO_S3_KEY_INVALID_FORMAT', async () => {
        expect(
          await codesForField(
            { photoS3Key: 'users/avatars/1.jpg?x=1' },
            'photoS3Key',
          ),
        ).toEqual([ValidationErrorCode.PHOTO_S3_KEY_INVALID_FORMAT]);
      });

      it('rejects a space with PHOTO_S3_KEY_INVALID_FORMAT', async () => {
        expect(
          await codesForField(
            { photoS3Key: 'users/avatars/1 final.jpg' },
            'photoS3Key',
          ),
        ).toEqual([ValidationErrorCode.PHOTO_S3_KEY_INVALID_FORMAT]);
      });
    });
  });
});
