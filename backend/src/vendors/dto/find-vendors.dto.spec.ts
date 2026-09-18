import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindVendorsDto } from './find-vendors.dto.js';

describe('FindVendorsDto NUL rejection (Postgres text cannot hold NUL)', () => {
  it.each(['name', 'websiteUrl'])('rejects a NUL byte in %s', async (field) => {
    const dto = plainToInstance(FindVendorsDto, {
      [field]: `a${String.fromCharCode(0)}b`,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it('accepts ordinary filters', async () => {
    const dto = plainToInstance(FindVendorsDto, { name: 'x', websiteUrl: 'y' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
