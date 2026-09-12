import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { FindListingsDto } from './find-listings.dto.js';

// Query DTOs are constructed from HTTP query strings, so inputs arrive as
// strings even for numeric/boolean fields.
function build(query: Record<string, string>) {
  return plainToInstance(FindListingsDto, query);
}

describe('FindListingsDto', () => {
  it('applies documented defaults when page/limit are omitted', () => {
    const dto = build({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts every documented filter combined with no pagination override', async () => {
    const dto = build({
      fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      vendorId: '1',
      inStock: 'true',
      minPrice: '1000',
      maxPrice: '100000',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  describe('fragranceId', () => {
    it('passes when omitted (no filter)', async () => {
      const dto = build({});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a non-uuid fragranceId', async () => {
      const dto = build({ fragranceId: 'not-a-uuid' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'fragranceId')).toBe(true);
    });
  });

  describe('vendorId', () => {
    it('coerces a numeric query string to a number', () => {
      const dto = build({ vendorId: '3' });
      expect(dto.vendorId).toBe(3);
    });

    it('rejects a non-numeric vendorId', async () => {
      const dto = build({ vendorId: 'abc' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'vendorId')).toBe(true);
    });
  });

  describe('inStock', () => {
    it('transforms the string "true" to boolean true', async () => {
      const dto = build({ inStock: 'true' });
      expect(dto.inStock).toBe(true);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('transforms the string "false" to boolean false', async () => {
      const dto = build({ inStock: 'false' });
      expect(dto.inStock).toBe(false);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a value that is not "true"/"false"', async () => {
      const dto = build({ inStock: 'maybe' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'inStock')).toBe(true);
    });
  });

  describe('minPrice / maxPrice boundaries (Min(0))', () => {
    it.each(['minPrice', 'maxPrice'] as const)(
      '%s accepts the boundary value 0',
      async (field) => {
        const dto = build({ [field]: '0' });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it.each(['minPrice', 'maxPrice'] as const)(
      '%s rejects the neighbor below the boundary, -1',
      async (field) => {
        const dto = build({ [field]: '-1' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === field)).toBe(true);
      },
    );

    it.each(['minPrice', 'maxPrice'] as const)(
      '%s rejects a non-integer value',
      async (field) => {
        const dto = build({ [field]: '10.5' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === field)).toBe(true);
      },
    );

    // The spec treats minPrice/maxPrice as an independent inclusive range —
    // nothing in FindListingsDto cross-validates that minPrice <= maxPrice,
    // so a caller sending an inverted range (min above max) validates fine
    // at the DTO level and simply yields zero rows at the query level. This
    // documents that deliberate absence of cross-field validation rather
    // than asserting a rejection that doesn't happen.
    it('accepts minPrice > maxPrice at the DTO level (no cross-field check)', async () => {
      const dto = build({ minPrice: '100', maxPrice: '10' });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('page boundary (Min(1))', () => {
    it('accepts the boundary value 1', async () => {
      const dto = build({ page: '1' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor below the boundary, 0', async () => {
      const dto = build({ page: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects a negative page', async () => {
      const dto = build({ page: '-1' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects a non-integer page', async () => {
      const dto = build({ page: '1.5' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects a non-numeric page', async () => {
      const dto = build({ page: 'abc' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });
  });

  describe('limit boundaries (Min(1), Max(100))', () => {
    it('accepts the lower boundary value 1', async () => {
      const dto = build({ limit: '1' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor below the lower boundary, 0', async () => {
      const dto = build({ limit: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('accepts the upper boundary value 100', async () => {
      const dto = build({ limit: '100' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor above the upper boundary, 101', async () => {
      const dto = build({ limit: '101' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
