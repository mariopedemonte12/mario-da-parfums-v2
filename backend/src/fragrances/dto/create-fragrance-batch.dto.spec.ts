import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFragranceBatchDto } from './create-fragrance-batch.dto.js';

const VALID_ITEM = { name: 'Bleu de Chanel', brand: 'Chanel' };

describe('CreateFragranceBatchDto', () => {
  // Boundary on array length: ArrayNotEmpty makes 0 items the invalid
  // boundary and 1 item its valid neighbor.
  it('rejects an empty items array', async () => {
    const dto = plainToInstance(CreateFragranceBatchDto, { items: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('accepts a single valid item', async () => {
    const dto = plainToInstance(CreateFragranceBatchDto, {
      items: [VALID_ITEM],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts multiple valid items', async () => {
    const dto = plainToInstance(CreateFragranceBatchDto, {
      items: [VALID_ITEM, { name: 'Sauvage', brand: 'Dior' }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('surfaces nested validation errors for an invalid item', async () => {
    const dto = plainToInstance(CreateFragranceBatchDto, {
      items: [{ brand: 'Chanel' }], // missing required name
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
    const nested = errors.find((e) => e.property === 'items')?.children?.[0];
    expect(nested?.property).toBe('0');
    expect(nested?.children?.some((c) => c.property === 'name')).toBe(true);
  });
});
