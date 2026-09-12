import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { UpdateListingDto } from './update-listing.dto.js';

describe('UpdateListingDto', () => {
  // Spec: "UpdateListingDto es PartialType(CreateListingDto)" — every field
  // becomes optional, but the same per-field validation applies whenever a
  // field is actually supplied. Repointing fragranceId/vendorId is allowed
  // (no field is special-cased as immutable), so this DTO deliberately does
  // not forbid any single-field combination.

  it('accepts an empty object (no fields being updated)', async () => {
    const dto = plainToInstance(UpdateListingDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a partial update with a single valid field', async () => {
    const dto = plainToInstance(UpdateListingDto, { price: 79990 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts repointing fragranceId and vendorId together', async () => {
    const dto = plainToInstance(UpdateListingDto, {
      fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      vendorId: 2,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('still enforces type validation on a supplied field', async () => {
    const dto = plainToInstance(UpdateListingDto, { price: 'expensive' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['price']);
  });

  it('still enforces the url format validator when supplied', async () => {
    const dto = plainToInstance(UpdateListingDto, { url: 'not-a-url' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['url']);
  });

  it('still enforces the fragranceId uuid format when supplied', async () => {
    const dto = plainToInstance(UpdateListingDto, {
      fragranceId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['fragranceId']);
  });

  it('still enforces @Min(1) on vendorId when supplied', async () => {
    const dto = plainToInstance(UpdateListingDto, { vendorId: 0 });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['vendorId']);
  });
});
