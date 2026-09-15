import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { and, eq, ilike } from 'drizzle-orm';
import { UsersService } from './users.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { users } from '../database/schema/user.schema.js';
import { Role } from '../shared/enums/role.enums.js';

// Spy on the real ilike/eq/and so we can assert *which* condition builder the
// service used per field (name/email: partial/case-insensitive vs role:
// exact), without asserting on drizzle's internal SQL fragment shape.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    ilike: vi.fn(actual.ilike),
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
  };
});

describe('UsersService', () => {
  let service: UsersService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const sampleUser = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: Role.USER,
    passwordHash: 'hashed',
    photoS3Key: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mocks the select().from().where().limit().offset() chain used by
  // findAll: rows resolve directly off .offset(), the parallel count query
  // resolves directly off .where() — neither branch calls .execute(),
  // matching UsersService.findAll's actual query shape.
  function mockSelectChain(rows: unknown[], total: number) {
    const whereMock = vi.fn();
    let call = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: (...args: unknown[]) => {
          whereMock(...args);
          call += 1;
          if (call === 1) {
            return {
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(rows),
              }),
            };
          }
          return Promise.resolve([{ value: total }]);
        },
      }),
    }));
    return whereMock;
  }

  beforeEach(async () => {
    vi.mocked(ilike).mockClear();
    vi.mocked(eq).mockClear();
    vi.mocked(and).mockClear();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([sampleUser]),
          }),
        }),
      });

      const result = await service.findByEmail('jane@example.com');

      expect(result).toEqual(sampleUser);
    });

    it('returns undefined when no user matches', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('inserts the user and returns the inserted row', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([sampleUser]),
        }),
      });

      const result = await service.create({
        name: sampleUser.name,
        email: sampleUser.email,
        passwordHash: sampleUser.passwordHash,
        role: Role.USER,
      });

      expect(result).toEqual(sampleUser);
    });

    it('inserts through the given transaction handle instead of the pooled db when one is passed', async () => {
      const txInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([sampleUser]),
        }),
      });
      const tx = { insert: txInsert } as unknown as typeof db;

      const result = await service.create(
        {
          name: sampleUser.name,
          email: sampleUser.email,
          passwordHash: sampleUser.passwordHash,
          role: Role.USER,
        },
        tx,
      );

      expect(result).toEqual(sampleUser);
      expect(txInsert).toHaveBeenCalledWith(users);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns rows and total from the parallel rows/count queries', async () => {
      mockSelectChain([sampleUser], 1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual([sampleUser]);
      expect(result.total).toBe(1);
    });

    it('applies documented pagination math: limit and (page-1)*limit offset', async () => {
      let call = 0;
      let limitArg: number | undefined;
      let offsetArg: number | undefined;
      db.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: () => {
            call += 1;
            if (call === 1) {
              return {
                limit: (l: number) => {
                  limitArg = l;
                  return {
                    offset: (o: number) => {
                      offsetArg = o;
                      return Promise.resolve([sampleUser]);
                    },
                  };
                },
              };
            }
            return Promise.resolve([{ value: 1 }]);
          },
        }),
      }));

      await service.findAll({ page: 3, limit: 10 });

      expect(limitArg).toBe(10);
      expect(offsetArg).toBe(20); // (page 3 - 1) * limit 10
    });

    it('builds no filter condition (where: undefined) when no filters are given', async () => {
      const whereMock = mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20 });

      expect(whereMock).toHaveBeenCalledWith(undefined);
    });

    it('filters name as a case-insensitive partial (contains) match', async () => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, name: 'Jane' });

      expect(ilike).toHaveBeenCalledWith(users.name, '%Jane%');
      expect(eq).not.toHaveBeenCalledWith(users.name, 'Jane');
    });

    it('filters email as a case-insensitive partial (contains) match', async () => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, email: 'jane@' });

      expect(ilike).toHaveBeenCalledWith(users.email, '%jane@%');
    });

    // Regression: a literal `%`/`_` in the search term used to be sent
    // straight into the ILIKE pattern and interpreted as a SQL wildcard
    // instead of a literal character (e.g. an email local-part with a real
    // underscore) — see common/utils/sql-like.util.ts.
    it('escapes literal `%`/`_` in the name/email filters before building the pattern', async () => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, name: 'A_B', email: 'x%y' });

      expect(ilike).toHaveBeenCalledWith(users.name, '%A\\_B%');
      expect(ilike).toHaveBeenCalledWith(users.email, '%x\\%y%');
    });

    it('filters role as an exact match, not a partial one', async () => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, role: Role.ADMIN });

      expect(eq).toHaveBeenCalledWith(users.role, Role.ADMIN);
      expect(ilike).not.toHaveBeenCalledWith(users.role, expect.anything());
    });

    it('combines multiple filters with AND', async () => {
      mockSelectChain([], 0);

      await service.findAll({
        page: 1,
        limit: 20,
        name: 'Jane',
        role: Role.ADMIN,
      });

      expect(and).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the user when found', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([sampleUser]),
        }),
      });

      const result = await service.findOne(1);

      expect(result).toEqual(sampleUser);
    });

    it('throws NotFoundException when no row matches', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findOne(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates the row and returns it', async () => {
      let setArg: Record<string, unknown> | undefined;
      db.update.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          setArg = arg;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { ...sampleUser, name: 'New Name' },
              ]),
            }),
          };
        },
      });

      const result = await service.update(1, { name: 'New Name' });

      expect(setArg).toEqual({ name: 'New Name' });
      expect(result.name).toBe('New Name');
    });

    it('throws NotFoundException when no row matches the id', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.update(999, { name: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException on a unique-name/email violation (23505)', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue({ code: '23505' }),
          }),
        }),
      });

      await expect(
        service.update(1, { email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-unique-violation db error as-is', async () => {
      const dbError = new Error('connection reset');
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(dbError),
          }),
        }),
      });

      await expect(
        service.update(1, { name: 'New Name' }),
      ).rejects.toBe(dbError);
    });
  });

  describe('remove', () => {
    it('deletes the row and resolves when found', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([sampleUser]),
        }),
      });

      await expect(service.remove(1)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when no row matches the id', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.remove(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
