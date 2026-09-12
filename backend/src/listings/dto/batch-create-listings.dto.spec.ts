import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { BatchCreateListingsDto } from './batch-create-listings.dto.js';

const VALID_ITEM = {
  fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  vendorId: 1,
  sizeMl: 100,
  price: 89990,
  url: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
};

describe('BatchCreateListingsDto', () => {
  // Boundary on array length: ArrayMinSize(1) makes 0 items the invalid
  // boundary and 1 item its valid neighbor.
  it('rejects an empty items array', async () => {
    const dto = plainToInstance(BatchCreateListingsDto, { items: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('accepts a single valid item', async () => {
    const dto = plainToInstance(BatchCreateListingsDto, {
      items: [VALID_ITEM],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts multiple valid items, even ones that would collide at the DB level', async () => {
    // DTO-level validation has no visibility into the unique-index
    // (vendorId, fragranceId, sizeMl) — two structurally-identical items
    // both pass validation; the conflict is a per-item DB write concern
    // (see listings.service.spec.ts), not something this DTO enforces.
    const dto = plainToInstance(BatchCreateListingsDto, {
      items: [VALID_ITEM, VALID_ITEM],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('surfaces nested validation errors for an invalid item', async () => {
    const dto = plainToInstance(BatchCreateListingsDto, {
      items: [{ vendorId: 1 }], // missing required fragranceId/sizeMl/price/url
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
    const nested = errors.find((e) => e.property === 'items')?.children?.[0];
    expect(nested?.property).toBe('0');
    expect(
      nested?.children?.some((c) => c.property === 'fragranceId'),
    ).toBe(true);
  });

  it('isolates a single invalid item from an otherwise valid batch', async () => {
    const dto = plainToInstance(BatchCreateListingsDto, {
      items: [VALID_ITEM, { ...VALID_ITEM, price: -1 }],
    });
    const errors = await validate(dto);
    const nested = errors.find((e) => e.property === 'items')?.children;
    // Only the second item (index '1') should carry a nested error.
    expect(nested?.map((c) => c.property)).toEqual(['1']);
  });
});
