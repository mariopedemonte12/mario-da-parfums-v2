import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateFragranceDto } from './update-fragrance.dto.js';

describe('UpdateFragranceDto', () => {
  // Spec: "UpdateFragranceDto deriva de CreateFragranceDto vía PartialType" —
  // every field becomes optional, but the same per-field validation applies
  // whenever a field is actually supplied.

  it('accepts an empty object (no fields being updated)', async () => {
    const dto = plainToInstance(UpdateFragranceDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a partial update with a single valid field', async () => {
    const dto = plainToInstance(UpdateFragranceDto, { name: 'New Name' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('still enforces type validation on a supplied field', async () => {
    const dto = plainToInstance(UpdateFragranceDto, { name: 123 });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['name']);
  });

  it('still enforces the imageUrl format validator when supplied', async () => {
    const dto = plainToInstance(UpdateFragranceDto, {
      imageUrl: 'not-a-url',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['imageUrl']);
  });
});
