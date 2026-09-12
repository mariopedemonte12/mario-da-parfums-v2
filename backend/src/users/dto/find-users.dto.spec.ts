import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindUsersDto } from './find-users.dto.js';
import { Role } from '../../shared/enums/role.enums.js';

// Query DTOs are constructed from HTTP query strings, so inputs arrive as
// strings even for numeric fields.
function build(query: Record<string, string>) {
  return plainToInstance(FindUsersDto, query);
}

describe('FindUsersDto', () => {
  it('applies documented defaults when page/limit are omitted', () => {
    const dto = build({});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts name/email/role filters with no pagination override', async () => {
    const dto = build({
      name: 'Jane',
      email: 'jane@example.com',
      role: Role.ADMIN,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-string name filter', async () => {
    const dto = plainToInstance(FindUsersDto, { name: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a non-string email filter', async () => {
    const dto = plainToInstance(FindUsersDto, { email: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  describe('role', () => {
    it('accepts each declared enum value', async () => {
      for (const role of Object.values(Role)) {
        const dto = build({ role });
        expect(await validate(dto)).toHaveLength(0);
      }
    });

    it('rejects a value outside the Role enum', async () => {
      const dto = build({ role: 'superadmin' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'role')).toBe(true);
    });
  });

  describe('page boundary (Min(1))', () => {
    it('accepts the boundary value 1', async () => {
      const dto = build({ page: '1' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor below the boundary, 0', async () => {
      const dto = build({ page: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects a non-integer page', async () => {
      const dto = build({ page: '1.5' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects a non-numeric page', async () => {
      const dto = build({ page: 'abc' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });
  });

  describe('limit boundaries (Min(1), Max(100))', () => {
    it('accepts the lower boundary value 1', async () => {
      const dto = build({ limit: '1' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor below the lower boundary, 0', async () => {
      const dto = build({ limit: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('accepts the upper boundary value 100', async () => {
      const dto = build({ limit: '100' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects the neighbor above the upper boundary, 101', async () => {
      const dto = build({ limit: '101' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
