import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteFragranceBatchDto } from './delete-fragrance-batch.dto.js';

const VALID_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const VALID_ID_2 = 'c56a4180-65aa-42ec-a945-5fd21dec0538';

describe('DeleteFragranceBatchDto', () => {
  it('rejects an empty ids array', async () => {
    const dto = plainToInstance(DeleteFragranceBatchDto, { ids: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('accepts a single valid uuid', async () => {
    const dto = plainToInstance(DeleteFragranceBatchDto, {
      ids: [VALID_ID],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts multiple valid uuids', async () => {
    const dto = plainToInstance(DeleteFragranceBatchDto, {
      ids: [VALID_ID, VALID_ID_2],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID entry', async () => {
    const dto = plainToInstance(DeleteFragranceBatchDto, {
      ids: ['not-a-uuid'],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('rejects when only one of several entries is a non-UUID', async () => {
    const dto = plainToInstance(DeleteFragranceBatchDto, {
      ids: [VALID_ID, 'not-a-uuid'],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });
});
