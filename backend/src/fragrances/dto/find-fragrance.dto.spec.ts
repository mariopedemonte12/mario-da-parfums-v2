import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DEFAULT_LIMIT,
  FindFragranceDto,
  MAX_LIMIT,
} from './find-fragrance.dto.js';

const SAMPLE_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

// Query DTOs are constructed from HTTP query strings, so inputs arrive as
// strings even for numeric fields.
function build(query: Record<string, string>) {
  return plainToInstance(FindFragranceDto, query);
}

describe('FindFragranceDto', () => {
  it('applies the documented default when limit is omitted, with no cursor', () => {
    const dto = build({});
    expect(dto.cursor).toBeUndefined();
    expect(dto.limit).toBe(DEFAULT_LIMIT);
  });

  it('accepts name/brand/concentration/olfactoryFamily/targetAudience/longevity filters and no pagination override', async () => {
    const dto = build({
      name: 'Chanel',
      brand: 'Chanel',
      concentration: 'EDP',
      olfactoryFamily: 'Woody Spicy',
      targetAudience: 'Male',
      longevity: 'Medium-Strong',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-string name filter', async () => {
    const dto = plainToInstance(FindFragranceDto, { name: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  describe('cursor (IsUUID)', () => {
    it('passes when omitted (first page)', async () => {
      const dto = build({});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('accepts a valid uuid cursor', async () => {
      const dto = build({ cursor: SAMPLE_UUID });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a non-uuid cursor', async () => {
      const dto = build({ cursor: 'not-a-uuid' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'cursor')).toBe(true);
    });
  });

  describe('limit boundaries (Min(1), Max(MAX_LIMIT))', () => {
    it('accepts the lower boundary value 1', async () => {
      const dto = build({ limit: '1' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor below the lower boundary, 0', async () => {
      const dto = build({ limit: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it(`accepts the upper boundary value ${MAX_LIMIT}`, async () => {
      const dto = build({ limit: String(MAX_LIMIT) });
      expect(await validate(dto)).toHaveLength(0);
    });

    it(`rejects the neighbor above the upper boundary, ${MAX_LIMIT + 1}`, async () => {
      const dto = build({ limit: String(MAX_LIMIT + 1) });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
