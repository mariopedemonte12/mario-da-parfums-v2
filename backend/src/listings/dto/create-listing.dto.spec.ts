import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { CreateListingDto } from './create-listing.dto.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

const VALID_PAYLOAD = {
  fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  vendorId: 1,
  sizeMl: 100,
  price: 89990,
  url: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
  inStock: true,
};

async function codesForField(
  payload: Record<string, unknown>,
  field: string,
): Promise<string[]> {
  const dto = plainToInstance(CreateListingDto, payload);
  const errors = await validate(dto);
  const fieldError = errors.find((e) => e.property === field);
  if (!fieldError) return [];
  const messages = Object.values(fieldError.constraints ?? {});
  return messages.flatMap((message) =>
    (JSON.parse(message) as { code: string }[]).map((i) => i.code),
  );
}

describe('CreateListingDto', () => {
  it('accepts a fully populated valid payload', async () => {
    const dto = plainToInstance(CreateListingDto, VALID_PAYLOAD);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid payload without the optional inStock field', async () => {
    const { inStock: _inStock, ...rest } = VALID_PAYLOAD;
    const dto = plainToInstance(CreateListingDto, rest);
    expect(await validate(dto)).toHaveLength(0);
  });

  describe('fragranceId', () => {
    it('is required: missing fails, including LISTING_FRAGRANCE_ID_REQUIRED', async () => {
      const { fragranceId: _fragranceId, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'fragranceId')).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.LISTING_FRAGRANCE_ID_REQUIRED,
        ]),
      );
    });

    it('is required: empty string fails with LISTING_FRAGRANCE_ID_REQUIRED', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, fragranceId: '' },
          'fragranceId',
        ),
      ).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.LISTING_FRAGRANCE_ID_REQUIRED,
        ]),
      );
    });

    it('rejects a non-uuid value with LISTING_FRAGRANCE_ID_INVALID_FORMAT', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, fragranceId: 'not-a-uuid' },
          'fragranceId',
        ),
      ).toEqual([ValidationErrorCode.LISTING_FRAGRANCE_ID_INVALID_FORMAT]);
    });

    it('rejects a v1-style uuid (this field requires v4 specifically)', async () => {
      expect(
        await codesForField(
          {
            ...VALID_PAYLOAD,
            // A well-formed but non-v4 UUID (version nibble '1').
            fragranceId: '3fa85f64-5717-1562-b3fc-2c963f66afa6',
          },
          'fragranceId',
        ),
      ).toEqual([ValidationErrorCode.LISTING_FRAGRANCE_ID_INVALID_FORMAT]);
    });
  });

  describe('vendorId', () => {
    it('is required: missing fails, including LISTING_VENDOR_ID_REQUIRED', async () => {
      const { vendorId: _vendorId, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'vendorId')).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.LISTING_VENDOR_ID_REQUIRED,
        ]),
      );
    });

    it('accepts the lower boundary value 1', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, vendorId: 1 }, 'vendorId'),
      ).toEqual([]);
    });

    it('rejects the neighbor below the boundary, 0', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, vendorId: 0 }, 'vendorId'),
      ).toEqual([ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE]);
    });

    it('rejects a negative vendorId', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, vendorId: -1 }, 'vendorId'),
      ).toEqual([ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE]);
    });

    it('rejects a non-integer vendorId with LISTING_VENDOR_ID_INVALID_TYPE', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, vendorId: 1.5 }, 'vendorId'),
      ).toEqual([ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE]);
    });

    it('rejects a string vendorId (no @Type transform on this create dto)', async () => {
      // Both @IsInt and @Min reject a string operand, so the same code
      // surfaces from each constraint.
      expect(
        await codesForField({ ...VALID_PAYLOAD, vendorId: '1' }, 'vendorId'),
      ).toEqual(
        expect.arrayContaining([
          ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE,
        ]),
      );
    });
  });

  describe('sizeMl', () => {
    it('is required: missing fails, including LISTING_SIZE_ML_REQUIRED', async () => {
      const { sizeMl: _sizeMl, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'sizeMl')).toEqual(
        expect.arrayContaining([ValidationErrorCode.LISTING_SIZE_ML_REQUIRED]),
      );
    });

    it('accepts the lower boundary value 1', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, sizeMl: 1 }, 'sizeMl'),
      ).toEqual([]);
    });

    it('rejects the neighbor below the boundary, 0', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, sizeMl: 0 }, 'sizeMl'),
      ).toEqual([ValidationErrorCode.LISTING_SIZE_ML_INVALID_TYPE]);
    });

    it('rejects a negative sizeMl', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, sizeMl: -1 }, 'sizeMl'),
      ).toEqual([ValidationErrorCode.LISTING_SIZE_ML_INVALID_TYPE]);
    });

    it('rejects a non-integer sizeMl', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, sizeMl: 100.5 }, 'sizeMl'),
      ).toEqual([ValidationErrorCode.LISTING_SIZE_ML_INVALID_TYPE]);
    });
  });

  describe('price', () => {
    it('is required: missing fails, including LISTING_PRICE_REQUIRED', async () => {
      const { price: _price, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'price')).toEqual(
        expect.arrayContaining([ValidationErrorCode.LISTING_PRICE_REQUIRED]),
      );
    });

    it('accepts the lower boundary value 1', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, price: 1 }, 'price'),
      ).toEqual([]);
    });

    it('rejects the neighbor below the boundary, 0', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, price: 0 }, 'price'),
      ).toEqual([ValidationErrorCode.LISTING_PRICE_INVALID_TYPE]);
    });

    it('rejects a negative price', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, price: -1 }, 'price'),
      ).toEqual([ValidationErrorCode.LISTING_PRICE_INVALID_TYPE]);
    });

    it('rejects a non-integer price (CLP has no subunit)', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, price: 99.99 }, 'price'),
      ).toEqual([ValidationErrorCode.LISTING_PRICE_INVALID_TYPE]);
    });
  });

  describe('url', () => {
    it('is required: missing fails, including LISTING_URL_REQUIRED', async () => {
      const { url: _url, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'url')).toEqual(
        expect.arrayContaining([ValidationErrorCode.LISTING_URL_REQUIRED]),
      );
    });

    it('is required: empty string fails, including LISTING_URL_REQUIRED', async () => {
      expect(await codesForField({ ...VALID_PAYLOAD, url: '' }, 'url')).toEqual(
        expect.arrayContaining([ValidationErrorCode.LISTING_URL_REQUIRED]),
      );
    });

    it('rejects a malformed url with LISTING_URL_INVALID_FORMAT', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, url: 'not-a-url' }, 'url'),
      ).toEqual([ValidationErrorCode.LISTING_URL_INVALID_FORMAT]);
    });

    it('rejects a disallowed protocol (ftp) with LISTING_URL_INVALID_FORMAT', async () => {
      expect(
        await codesForField(
          { ...VALID_PAYLOAD, url: 'ftp://example.com/a' },
          'url',
        ),
      ).toEqual([ValidationErrorCode.LISTING_URL_INVALID_FORMAT]);
    });

    describe('500-char length boundary', () => {
      const base = 'https://a.example.com/';

      it('accepts a url at exactly 500 chars', async () => {
        const url = base + 'x'.repeat(500 - base.length);
        expect(url).toHaveLength(500);
        expect(await codesForField({ ...VALID_PAYLOAD, url }, 'url')).toEqual(
          [],
        );
      });

      it('rejects a url one char past 500, with LISTING_URL_TOO_LONG', async () => {
        const url = base + 'x'.repeat(501 - base.length);
        expect(url).toHaveLength(501);
        expect(await codesForField({ ...VALID_PAYLOAD, url }, 'url')).toEqual([
          ValidationErrorCode.LISTING_URL_TOO_LONG,
        ]);
      });
    });
  });

  describe('inStock (optional)', () => {
    it('passes when omitted', async () => {
      const { inStock: _inStock, ...rest } = VALID_PAYLOAD;
      expect(await codesForField(rest, 'inStock')).toEqual([]);
    });

    it.each([true, false])('accepts explicit boolean %s', async (value) => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, inStock: value }, 'inStock'),
      ).toEqual([]);
    });

    it('rejects a non-boolean value with LISTING_IN_STOCK_INVALID_TYPE', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, inStock: 'yes' }, 'inStock'),
      ).toEqual([ValidationErrorCode.LISTING_IN_STOCK_INVALID_TYPE]);
    });

    it('rejects a numeric 1/0 in place of a boolean', async () => {
      expect(
        await codesForField({ ...VALID_PAYLOAD, inStock: 1 }, 'inStock'),
      ).toEqual([ValidationErrorCode.LISTING_IN_STOCK_INVALID_TYPE]);
    });
  });
});
