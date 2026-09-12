import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import {
  BatchUpdateListingsDto,
  UpdateListingItemDto,
} from './batch-update-listings.dto.js';

describe('UpdateListingItemDto', () => {
  // Decision table: id valid/invalid crossed with body valid/invalid.
  it('accepts a valid id with a valid partial body', async () => {
    const dto = plainToInstance(UpdateListingItemDto, {
      id: 1,
      price: 79990,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a valid id with an empty body (id-only update)', async () => {
    const dto = plainToInstance(UpdateListingItemDto, { id: 1 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-integer id with an otherwise valid body', async () => {
    const dto = plainToInstance(UpdateListingItemDto, {
      id: 1.5,
      price: 79990,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['id']);
  });

  it('rejects a missing id', async () => {
    const dto = plainToInstance(UpdateListingItemDto, { price: 79990 });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['id']);
  });

  it('rejects a valid id with an invalid body field', async () => {
    const dto = plainToInstance(UpdateListingItemDto, {
      id: 1,
      price: 'expensive',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['price']);
  });

  it('rejects both an invalid id and an invalid body field', async () => {
    const dto = plainToInstance(UpdateListingItemDto, {
      id: 'not-an-id',
      price: 'expensive',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property).sort()).toEqual(['id', 'price']);
  });
});

describe('BatchUpdateListingsDto', () => {
  it('rejects an empty items array', async () => {
    const dto = plainToInstance(BatchUpdateListingsDto, { items: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('accepts a single valid item', async () => {
    const dto = plainToInstance(BatchUpdateListingsDto, {
      items: [{ id: 1, price: 79990 }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
