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

  it('accepts search/concentration/olfactoryFamily/targetAudience/longevity filters and no pagination override', async () => {
    const dto = build({
      search: 'Chanel',
      concentration: 'EDP',
      olfactoryFamily: 'Woody Spicy',
      targetAudience: 'Male',
      longevity: 'Medium-Strong',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-string search filter', async () => {
    const dto = plainToInstance(FindFragranceDto, { search: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });

  describe('search normalization and limits (spec rules 7-9)', () => {
    const errorsFor = async (search: string) =>
      (await validate(build({ search }))).filter((e) => e.property === 'search');

    it('accepts 100 real characters plus surrounding whitespace (trim before validate)', async () => {
      expect(await errorsFor(`${'a'.repeat(100)}   `)).toHaveLength(0);
      expect(build({ search: `  ${'a'.repeat(100)}  ` }).search).toBe(
        'a'.repeat(100),
      );
    });

    it('rejects 101 real characters', async () => {
      expect(await errorsFor('a'.repeat(101))).not.toHaveLength(0);
    });

    it('de-duplicates tokens (case-insensitive) before counting', async () => {
      expect(await errorsFor('a a A a a a')).toHaveLength(0);
      expect(build({ search: 'a a A a a a' }).search).toBe('a');
    });

    it('accepts 5 distinct tokens and rejects 6', async () => {
      expect(await errorsFor('a b c d e')).toHaveLength(0);
      expect(await errorsFor('a b c d e f')).not.toHaveLength(0);
    });

    it('collapses whitespace-only input to an empty string', () => {
      expect(build({ search: '   ' }).search).toBe('');
    });

    it.each([
      'search',
      'concentration',
      'olfactoryFamily',
      'targetAudience',
      'longevity',
    ])('rejects a NUL byte in %s', async (field) => {
      const nul = String.fromCharCode(0);
      const errors = await validate(build({ [field]: `a${nul}b` }));
      expect(errors.some((e) => e.property === field)).toBe(true);
    });
  });

  it('no longer declares name/brand filters', () => {
    // Global ValidationPipe (whitelist: true) strips these, so they are
    // silently ignored — see specs/text-search-partial.md.
    expect(Object.keys(new FindFragranceDto())).not.toContain('name');
    expect(Object.keys(new FindFragranceDto())).not.toContain('brand');
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
