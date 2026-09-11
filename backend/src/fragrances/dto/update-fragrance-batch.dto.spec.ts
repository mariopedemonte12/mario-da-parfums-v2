import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  UpdateFragranceBatchDto,
  UpdateFragranceBatchItemDto,
} from './update-fragrance-batch.dto.js';

const VALID_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('UpdateFragranceBatchItemDto', () => {
  // Decision table: id valid/invalid crossed with body valid/invalid.
  it('accepts a valid id with a valid partial body', async () => {
    const dto = plainToInstance(UpdateFragranceBatchItemDto, {
      id: VALID_ID,
      name: 'New Name',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID id with an otherwise valid body', async () => {
    const dto = plainToInstance(UpdateFragranceBatchItemDto, {
      id: 'not-a-uuid',
      name: 'New Name',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['id']);
  });

  it('rejects a missing id', async () => {
    const dto = plainToInstance(UpdateFragranceBatchItemDto, {
      name: 'New Name',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['id']);
  });

  it('rejects a valid id with an invalid body field', async () => {
    const dto = plainToInstance(UpdateFragranceBatchItemDto, {
      id: VALID_ID,
      name: 123,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['name']);
  });

  it('rejects both an invalid id and an invalid body field', async () => {
    const dto = plainToInstance(UpdateFragranceBatchItemDto, {
      id: 'not-a-uuid',
      name: 123,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property).sort()).toEqual(['id', 'name']);
  });
});

describe('UpdateFragranceBatchDto', () => {
  it('rejects an empty items array', async () => {
    const dto = plainToInstance(UpdateFragranceBatchDto, { items: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('accepts a single valid item', async () => {
    const dto = plainToInstance(UpdateFragranceBatchDto, {
      items: [{ id: VALID_ID, name: 'New Name' }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
