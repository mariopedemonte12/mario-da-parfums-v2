import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { BatchDeleteListingsDto } from './batch-delete-listings.dto.js';

describe('BatchDeleteListingsDto', () => {
  it('rejects an empty ids array', async () => {
    const dto = plainToInstance(BatchDeleteListingsDto, { ids: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('accepts a single valid id', async () => {
    const dto = plainToInstance(BatchDeleteListingsDto, { ids: [1] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts multiple valid ids', async () => {
    const dto = plainToInstance(BatchDeleteListingsDto, { ids: [1, 2, 3] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-integer entry', async () => {
    const dto = plainToInstance(BatchDeleteListingsDto, { ids: [1.5] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('rejects when only one of several entries is non-integer', async () => {
    const dto = plainToInstance(BatchDeleteListingsDto, { ids: [1, 'two'] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });
});
