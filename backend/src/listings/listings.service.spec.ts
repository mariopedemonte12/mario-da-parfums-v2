import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ListingsService } from './listings.service.js';
import { DRIZZLE } from '../database/database.module.js';

// Test design: see specs/listings-crud.md (source of truth) +
// .claude/skills/testing/SKILL.md. Drizzle is mocked at the db-call boundary
// (per backend/CLAUDE.md); every chain here mirrors the exact call shape
// used by listings.service.ts — note there is no trailing `.execute()` in
// this service (unlike fragrances/vendors), the query builder itself is
// awaited directly.

describe('ListingsService', () => {
  let service: ListingsService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const sampleRow = {
    id: 1,
    fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    vendorId: 1,
    sizeMl: 100,
    price: 89990,
    url: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
    inStock: true,
    scrapedAt: new Date('2026-01-01T00:00:00Z'),
  };

  // Mocks the select().from().where().limit().offset() chain used by
  // findAll's rows query, resolved in parallel (Promise.all) with the
  // select({value: count()}).from().where() chain for the count query.
  // The array literal in Promise.all evaluates left-to-right synchronously,
  // so the rows query's where() is always called first (call===1) and the
  // count query's where() second (call===2).
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
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ListingsService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns rows as-is (not remapped) plus the total count', async () => {
      mockSelectChain([sampleRow], 1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.data).toEqual([sampleRow]);
    });

    it('builds no filter condition (where: undefined) when no filters are given', async () => {
      const whereMock = mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20 });

      expect(whereMock).toHaveBeenCalledWith(undefined);
    });

    it.each([
      ['fragranceId', { fragranceId: sampleRow.fragranceId }],
      ['vendorId', { vendorId: 1 }],
      ['inStock: true', { inStock: true }],
      ['inStock: false', { inStock: false }],
      ['minPrice', { minPrice: 1000 }],
      ['maxPrice', { maxPrice: 100000 }],
    ])(
      'builds a defined filter condition when %s is given',
      async (_label, filter) => {
        const whereMock = mockSelectChain([], 0);

        await service.findAll({ page: 1, limit: 20, ...filter });

        expect(whereMock).toHaveBeenCalledTimes(2);
        expect(whereMock.mock.calls[0][0]).toBeDefined();
      },
    );

    it('builds a defined filter condition when all filters are combined', async () => {
      const whereMock = mockSelectChain([], 0);

      await service.findAll({
        page: 1,
        limit: 20,
        fragranceId: sampleRow.fragranceId,
        vendorId: 1,
        inStock: true,
        minPrice: 1000,
        maxPrice: 100000,
      });

      expect(whereMock.mock.calls[0][0]).toBeDefined();
    });

    // inStock is explicitly boolean-typed and false is a meaningful filter
    // value (not "absent") — distinct from fragranceId/vendorId/minPrice/
    // maxPrice which use `undefined`/falsy-ish checks. This guards against a
    // mutant that swaps `!== undefined` for a plain truthiness check on
    // inStock, which would silently drop the `inStock=false` filter.
    it('does not treat inStock: false as "no filter"', async () => {
      const whereMock = mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, inStock: false });

      expect(whereMock.mock.calls[0][0]).toBeDefined();
    });

    it.each([
      [1, 10, 0],
      [2, 10, 10],
      [3, 10, 20],
      [1, 20, 0],
      [5, 1, 4],
    ])(
      'applies documented pagination math for page=%i, limit=%i: offset=%i',
      async (page, limit, expectedOffset) => {
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
                        return Promise.resolve([sampleRow]);
                      },
                    };
                  },
                };
              }
              return Promise.resolve([{ value: 1 }]);
            },
          }),
        }));

        await service.findAll({ page, limit });

        expect(limitArg).toBe(limit);
        expect(offsetArg).toBe(expectedOffset);
      },
    );

    it('falls back to total: 0 when the count query returns no row', async () => {
      let call = 0;
      db.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: () => {
            call += 1;
            if (call === 1) {
              return {
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              };
            }
            return Promise.resolve([]);
          },
        }),
      }));

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns the raw row when found', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([sampleRow]),
        }),
      });

      const result = await service.findOne(1);

      expect(result).toEqual(sampleRow);
    });

    it('throws NotFoundException when no row matches', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createMany', () => {
    const createDto = {
      fragranceId: sampleRow.fragranceId,
      vendorId: 1,
      sizeMl: 100,
      price: 89990,
      url: sampleRow.url,
    };

    it('reports success:true with the new id on a successful insert', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...sampleRow, id: 7 }]),
        }),
      });

      const [result] = await service.createMany([createDto]);

      expect(result).toEqual({ id: 7, success: true });
    });

    it('reports a per-item conflict on a unique (vendorId, fragranceId, sizeMl) violation (23505)', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({ code: '23505' }),
        }),
      });

      const [result] = await service.createMany([createDto]);

      expect(result).toEqual({
        success: false,
        error: 'A listing for this vendor/fragrance/size already exists',
      });
    });

    it('reports a per-item not-found on an FK violation (23503)', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({ code: '23503' }),
        }),
      });

      const [result] = await service.createMany([createDto]);

      expect(result).toEqual({
        success: false,
        error: 'Fragrance or vendor not found',
      });
    });

    it('reports a generic error for an unrecognized db error code', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('connection reset')),
        }),
      });

      const [result] = await service.createMany([createDto]);

      expect(result).toEqual({ success: false, error: 'Unexpected error' });
    });

    it('reports independent per-item results for a mixed batch, preserving order', async () => {
      let call = 0;
      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            call += 1;
            if (call === 1) return Promise.resolve([{ ...sampleRow, id: 1 }]);
            return Promise.reject({ code: '23505' });
          }),
        }),
      }));

      const results = await service.createMany([createDto, createDto]);

      expect(results).toEqual([
        { id: 1, success: true },
        {
          success: false,
          error: 'A listing for this vendor/fragrance/size already exists',
        },
      ]);
    });
  });

  describe('updateMany', () => {
    it('reports success:true and bumps scrapedAt on a successful update', async () => {
      let setArg: Record<string, unknown> | undefined;
      db.update.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          setArg = arg;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([sampleRow]),
            }),
          };
        },
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, price: 79990 },
      ]);

      expect(result).toEqual({ id: sampleRow.id, success: true });
      expect(setArg?.scrapedAt).toBeInstanceOf(Date);
      expect(setArg?.price).toBe(79990);
    });

    it('bumps scrapedAt even when the item carries no other field to change', async () => {
      let setArg: Record<string, unknown> | undefined;
      db.update.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          setArg = arg;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([sampleRow]),
            }),
          };
        },
      });

      await service.updateMany([{ id: sampleRow.id }]);

      expect(Object.keys(setArg ?? {})).toEqual(['scrapedAt']);
    });

    it('allows repointing fragranceId/vendorId (no field is immutable)', async () => {
      let setArg: Record<string, unknown> | undefined;
      db.update.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          setArg = arg;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([sampleRow]),
            }),
          };
        },
      });

      await service.updateMany([
        { id: sampleRow.id, fragranceId: 'c56a4180-65aa-42ec-a945-5fd21dec0538', vendorId: 2 },
      ]);

      expect(setArg?.fragranceId).toBe('c56a4180-65aa-42ec-a945-5fd21dec0538');
      expect(setArg?.vendorId).toBe(2);
    });

    it('reports success:false with "Listing not found" when no row matches the id', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: 999, price: 1000 },
      ]);

      expect(result).toEqual({
        id: 999,
        success: false,
        error: 'Listing not found',
      });
    });

    it('reports a per-item conflict on a unique (vendorId, fragranceId, sizeMl) violation moving to an existing combo', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue({ code: '23505' }),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, sizeMl: 50 },
      ]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'A listing for this vendor/fragrance/size already exists',
      });
    });

    it('reports a per-item not-found on an FK violation repointing to an unknown fragranceId/vendorId', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue({ code: '23503' }),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, vendorId: 999 },
      ]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'Fragrance or vendor not found',
      });
    });

    it('reports a generic error for an unrecognized db error code', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('boom')),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, price: 1000 },
      ]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'Unexpected error',
      });
    });
  });

  describe('removeMany', () => {
    it('reports success:true when the row is deleted', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([sampleRow]),
        }),
      });

      const [result] = await service.removeMany([sampleRow.id]);

      expect(result).toEqual({ id: sampleRow.id, success: true });
    });

    it('reports success:false with "Listing not found" when no row matches the id', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const [result] = await service.removeMany([999]);

      expect(result).toEqual({
        id: 999,
        success: false,
        error: 'Listing not found',
      });
    });

    it('reports a generic per-item failure (not a thrown/batch-wide error) on a db error', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('connection reset')),
        }),
      });

      const [result] = await service.removeMany([sampleRow.id]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'Unexpected error',
      });
    });

    it('isolates a single item db error from the rest of the batch, preserving order', async () => {
      let call = 0;
      db.delete.mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            call += 1;
            if (call === 1) {
              return Promise.reject(new Error('connection reset'));
            }
            return Promise.resolve([sampleRow]);
          }),
        }),
      }));

      const results = await service.removeMany([999, sampleRow.id]);

      expect(results).toEqual([
        { id: 999, success: false, error: 'Unexpected error' },
        { id: sampleRow.id, success: true },
      ]);
    });
  });
});
