import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFragranceDto } from './create-fragrance.dto.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

const VALID_PAYLOAD = {
  name: 'Bleu de Chanel',
  brand: 'Chanel',
  concentration: 'Eau de Parfum',
  description: 'A woody aromatic fragrance.',
  imageUrl: 'https://example.com/images/bleu-de-chanel.jpg',
  olfactoryFamily: 'Woody Spicy',
  targetAudience: 'Male',
  longevity: 'Medium-Strong',
};

async function codesForField(
  payload: Record<string, unknown>,
  field: string,
): Promise<string[]> {
  const dto = plainToInstance(CreateFragranceDto, payload);
  const errors = await validate(dto);
  const fieldError = errors.find((e) => e.property === field);
  if (!fieldError) return [];
  const messages = Object.values(fieldError.constraints ?? {});
  return messages.flatMap((message) =>
    (JSON.parse(message) as { code: string }[]).map((i) => i.code),
  );
}

describe('CreateFragranceDto', () => {
  it('accepts a fully populated valid payload', async () => {
    const dto = plainToInstance(CreateFragranceDto, VALID_PAYLOAD);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid payload with only the required fields', async () => {
    const dto = plainToInstance(CreateFragranceDto, {
      name: 'Bleu de Chanel',
      brand: 'Chanel',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  describe('name', () => {
    it('is required: missing fails, including NAME_REQUIRED', async () => {
      // A missing value fails both @IsRequired and @IsStringField (undefined
      // is neither a non-empty value nor a string), so both codes surface.
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
      // @MaxLen also fails on a non-string value (class-validator's
      // maxLength() returns false for anything that isn't a string), so
      // NAME_TOO_LONG surfaces alongside NAME_INVALID_TYPE here.
      expect(
        await codesForField({ ...VALID_PAYLOAD, name: 123 }, 'name'),
      ).toEqual(
        expect.arrayContaining([ValidationErrorCode.NAME_INVALID_TYPE]),
      );
    });
  });

  describe('brand', () => {
    it('is required: missing fails, including BRAND_REQUIRED', async () => {
      const { brand: _brand, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'brand')).toEqual(
        expect.arrayContaining([ValidationErrorCode.BRAND_REQUIRED]),
      );
    });

    it('is required: empty string fails with BRAND_REQUIRED', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, brand: '' }, 'brand'),
      ).toEqual([ValidationErrorCode.BRAND_REQUIRED]);
    });

    it('rejects a non-string value with BRAND_INVALID_TYPE', async () => {
      // See the equivalent NAME_INVALID_TYPE case above: @MaxLen also
      // fails on a non-string value, so BRAND_TOO_LONG surfaces too.
      expect(
        await codesForField({ ...VALID_PAYLOAD, brand: 456 }, 'brand'),
      ).toEqual(
        expect.arrayContaining([ValidationErrorCode.BRAND_INVALID_TYPE]),
      );
    });
  });

  describe('concentration (optional)', () => {
    it('passes when omitted', async () => {
      const { concentration: _concentration, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'concentration')).toEqual([]);
    });

    it('rejects a non-string value with CONCENTRATION_INVALID_TYPE', async () => {
      // See the equivalent NAME_INVALID_TYPE case above: @MaxLen also
      // fails on a non-string value, so CONCENTRATION_TOO_LONG surfaces too.
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, concentration: 789 },
          'concentration',
        ),
      ).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.CONCENTRATION_INVALID_TYPE,
        ]),
      );
    });
  });

  describe('description (optional)', () => {
    it('passes when omitted', async () => {
      const { description: _description, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'description')).toEqual([]);
    });

    it('rejects a non-string value with DESCRIPTION_INVALID_TYPE', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, description: true },
          'description',
        ),
      ).toEqual([ValidationErrorCode.DESCRIPTION_INVALID_TYPE]);
    });
  });

  describe('imageUrl (optional)', () => {
    it('passes when omitted', async () => {
      const { imageUrl: _imageUrl, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'imageUrl')).toEqual([]);
    });

    it('passes when explicitly null', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, imageUrl: null }, 'imageUrl'),
      ).toEqual([]);
    });

    it('rejects a malformed/non-image URL with IMAGE_URL_INVALID_FORMAT', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, imageUrl: 'https://example.com/a.pdf' },
          'imageUrl',
        ),
      ).toEqual([ValidationErrorCode.IMAGE_URL_INVALID_FORMAT]);
    });
  });

  describe('olfactoryFamily (optional)', () => {
    it('passes when omitted', async () => {
      const { olfactoryFamily: _olfactoryFamily, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'olfactoryFamily')).toEqual([]);
    });

    it('rejects a non-string value with OLFACTORY_FAMILY_INVALID_TYPE', async () => {
      // See the equivalent NAME_INVALID_TYPE case above: @MaxLen also
      // fails on a non-string value, so OLFACTORY_FAMILY_TOO_LONG surfaces too.
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, olfactoryFamily: 789 },
          'olfactoryFamily',
        ),
      ).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.OLFACTORY_FAMILY_INVALID_TYPE,
        ]),
      );
    });
  });

  describe('targetAudience (optional)', () => {
    it('passes when omitted', async () => {
      const { targetAudience: _targetAudience, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'targetAudience')).toEqual([]);
    });

    it('rejects a non-string value with TARGET_AUDIENCE_INVALID_TYPE', async () => {
      // See the equivalent NAME_INVALID_TYPE case above: @MaxLen also
      // fails on a non-string value, so TARGET_AUDIENCE_TOO_LONG surfaces too.
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, targetAudience: 789 },
          'targetAudience',
        ),
      ).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.TARGET_AUDIENCE_INVALID_TYPE,
        ]),
      );
    });
  });

  describe('longevity (optional)', () => {
    it('passes when omitted', async () => {
      const { longevity: _longevity, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'longevity')).toEqual([]);
    });

    it('rejects a non-string value with LONGEVITY_INVALID_TYPE', async () => {
      // See the equivalent NAME_INVALID_TYPE case above: @MaxLen also
      // fails on a non-string value, so LONGEVITY_TOO_LONG surfaces too.
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, longevity: 789 },
          'longevity',
        ),
      ).toEqual(
        expect.arrayContaining([ValidationErrorCode.LONGEVITY_INVALID_TYPE]),
      );
    });
  });
});
