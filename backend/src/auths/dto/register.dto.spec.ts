import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

const VALID_PAYLOAD = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'Str0ng!Pass',
};

async function codesForField(
  payload: Record<string, unknown>,
  field: string,
): Promise<string[]> {
  const dto = plainToInstance(RegisterDto, payload);
  const errors = await validate(dto);
  const fieldError = errors.find((e) => e.property === field);
  if (!fieldError) return [];
  const messages = Object.values(fieldError.constraints ?? {});
  return messages.flatMap((message) =>
    (JSON.parse(message) as { code: string }[]).map((i) => i.code),
  );
}

describe('RegisterDto', () => {
  it('accepts a fully populated valid payload', async () => {
    const dto = plainToInstance(RegisterDto, VALID_PAYLOAD);
    expect(await validate(dto)).toHaveLength(0);
  });

  // Security-hardening finding: POST /auths/register with
  // name: "<script>alert(1)</script>" was accepted (201) and persisted
  // as-is — stored-XSS potential for any future consumer that renders it
  // unescaped. Per specs/security-hardening.md §5.
  describe('markup rejection (name/email)', () => {
    it('rejects a <script> tag in name with CONTAINS_MARKUP', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, name: '<script>alert(1)</script>' },
          'name',
        ),
      ).toEqual(expect.arrayContaining([ValidationErrorCode.CONTAINS_MARKUP]));
    });

    it('rejects an <img onerror=...> tag in name with CONTAINS_MARKUP', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, name: '<img src=x onerror=alert(1)>' },
          'name',
        ),
      ).toEqual(expect.arrayContaining([ValidationErrorCode.CONTAINS_MARKUP]));
    });
  });
});
