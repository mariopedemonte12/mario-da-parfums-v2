import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  FindFragranceDto,
  MAX_LIMIT,
} from './find-fragrance.dto.js';

// Query DTOs are constructed from HTTP query strings, so inputs arrive as
// strings even for numeric fields.
function build(query: Record<string, string>) {
  return plainToInstance(FindFragranceDto, query);
}

describe('FindFragranceDto', () => {
  it('applies documented defaults when page/limit are omitted', () => {
    const dto = build({});
    expect(dto.page).toBe(DEFAULT_PAGE);
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
