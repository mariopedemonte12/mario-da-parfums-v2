import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ilike, eq } from 'drizzle-orm';
import { FragrancesService } from './fragrances.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { fragrances } from '../database/schema/fragrance.schema.js';

// Spy on the real ilike/eq so we can assert *which* condition builder the
// service used per field (name: partial/case-insensitive vs
// brand/concentration: exact), without asserting on drizzle's internal SQL
// fragment shape.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    ilike: vi.fn(actual.ilike),
    eq: vi.fn(actual.eq),
  };
});

describe('FragrancesService', () => {
  let service: FragrancesService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const sampleRow = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Bleu de Chanel',
    brand: 'Chanel',
    concentration: 'Eau de Parfum',
    description: 'A woody aromatic fragrance.',
    imageUrl: 'https://example.com/images/bleu-de-chanel.jpg',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  // Mocks the select().from().where().limit().offset().execute() chain used
  // by findAll, resolving rows and the parallel count() query separately.
  function mockSelectChain(rows: unknown[], total: number) {
    const whereMock = vi.fn();
    let call = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: (...args: unknown[]) => {
          whereMock(...args);
          call += 1;
          if (call === 1) {
            // rows query: .limit().offset().execute()
            return {
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  execute: vi.fn().mockResolvedValue(rows),
                }),
              }),
            };
          }
          // count query: .execute()
          return { execute: vi.fn().mockResolvedValue([{ value: total }]) };
        },
      }),
    }));
    return whereMock;
  }

  beforeEach(async () => {
    vi.mocked(ilike).mockClear();
    vi.mocked(eq).mockClear();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FragrancesService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get<FragrancesService>(FragrancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns rows mapped to ResponseFragranceDto shape, plus total/page/limit', async () => {
      mockSelectChain([sampleRow], 1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toEqual([
        {
          id: sampleRow.id,
          name: sampleRow.name,
          brand: sampleRow.brand,
          concentration: sampleRow.concentration,
          description: sampleRow.description,
          imageUrl: sampleRow.imageUrl,
          createdAt: sampleRow.createdAt,
          updatedAt: sampleRow.updatedAt,
        },
      ]);
    });

    it('excludes fields not declared on ResponseFragranceDto (e.g. a leftover db-only field)', async () => {
      mockSelectChain([{ ...sampleRow, internalNotes: 'secret' }], 1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0]).not.toHaveProperty('internalNotes');
    });

    it('applies documented pagination math: limit and (page-1)*limit offset', async () => {
      // call is declared outside mockImplementation's callback so it is
      // shared across both concurrent db.select() invocations (rows query +
      // count query) in findAll's Promise.all — the rows query resolves its
      // chain first (evaluated first in the array literal), so call===1 is
      // reliably the rows branch and call===2 the count branch.
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
                      return {
                        execute: vi.fn().mockResolvedValue([sampleRow]),
                      };
                    },
                  };
                },
              };
            }
            return { execute: vi.fn().mockResolvedValue([{ value: 1 }]) };
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

    it.each([
      ['name', { name: 'Chanel' }],
      ['brand', { brand: 'Chanel' }],
      ['concentration', { concentration: 'EDP' }],
    ])(
      'builds a defined filter condition when %s is given',
      async (_label, filter) => {
        const whereMock = mockSelectChain([], 0);

        await service.findAll({ page: 1, limit: 20, ...filter });

        expect(whereMock).toHaveBeenCalledTimes(2);
        expect(whereMock.mock.calls[0][0]).toBeDefined();
      },
    );

    it('filters name as a case-insensitive partial (contains) match, not exact', async () => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, name: 'Chanel' });

      expect(ilike).toHaveBeenCalledWith(fragrances.name, '%Chanel%');
      expect(eq).not.toHaveBeenCalledWith(fragrances.name, 'Chanel');
    });

    it.each([
      ['brand', 'brand' as const],
      ['concentration', 'concentration' as const],
    ])('filters %s as an exact match', async (_label, field) => {
      mockSelectChain([], 0);

      await service.findAll({ page: 1, limit: 20, [field]: 'Chanel' });

      expect(eq).toHaveBeenCalledWith(fragrances[field], 'Chanel');
      expect(ilike).not.toHaveBeenCalled();
    });

    it('builds a defined filter condition when name, brand and concentration are all given', async () => {
      const whereMock = mockSelectChain([], 0);

      await service.findAll({
        page: 1,
        limit: 20,
        name: 'Chanel',
        brand: 'Chanel',
        concentration: 'EDP',
      });

      expect(whereMock.mock.calls[0][0]).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('returns the mapped fragrance when found', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([sampleRow]),
          }),
        }),
      });

      const result = await service.findOne(sampleRow.id);

      expect(result.id).toBe(sampleRow.id);
      expect(result.name).toBe(sampleRow.name);
    });

    it('throws NotFoundException when no row matches', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createMany', () => {
    it('reports success:true with the new id on a successful insert', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: sampleRow.id }]),
        }),
      });

      const [result] = await service.createMany([
        { name: 'Bleu de Chanel', brand: 'Chanel' },
      ]);

      expect(result).toEqual({ success: true, id: sampleRow.id });
    });

    it('reports a per-item conflict, not a thrown exception, on a unique-name violation', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({ code: '23505' }),
        }),
      });

      const [result] = await service.createMany([
        { name: 'Bleu de Chanel', brand: 'Chanel' },
      ]);

      expect(result).toEqual({
        success: false,
        error: 'Fragrance "Bleu de Chanel" already exists',
      });
    });

    it('reports a generic failure message for a non-unique-violation db error', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('connection reset')),
        }),
      });

      const [result] = await service.createMany([
        { name: 'Bleu de Chanel', brand: 'Chanel' },
      ]);

      expect(result).toEqual({
        success: false,
        error: 'Failed to save fragrance',
      });
    });

    it('reports independent per-item results for a mixed batch, preserving order', async () => {
      let call = 0;
      db.insert.mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            call += 1;
            if (call === 1) return Promise.resolve([{ id: 'id-1' }]);
            return Promise.reject({ code: '23505' });
          }),
        }),
      }));

      const results = await service.createMany([
        { name: 'Sauvage', brand: 'Dior' },
        { name: 'Bleu de Chanel', brand: 'Chanel' },
      ]);

      expect(results).toEqual([
        { success: true, id: 'id-1' },
        {
          success: false,
          error: 'Fragrance "Bleu de Chanel" already exists',
        },
      ]);
    });
  });

  describe('updateMany', () => {
    it('reports success:true and bumps updatedAt on a successful update', async () => {
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
        { id: sampleRow.id, name: 'New Name' },
      ]);

      expect(result).toEqual({ id: sampleRow.id, success: true });
      expect(setArg?.updatedAt).toBeInstanceOf(Date);
      expect(setArg?.name).toBe('New Name');
    });

    it('reports success:false with "Fragrance not found" when no row matches the id', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: 'missing-id', name: 'New Name' },
      ]);

      expect(result).toEqual({
        id: 'missing-id',
        success: false,
        error: 'Fragrance not found',
      });
    });

    it('reports a per-item conflict on a unique-name violation', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue({ code: '23505' }),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, name: 'Existing Name' },
      ]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'Fragrance "Existing Name" already exists',
      });
    });

    it('reports a generic failure message for a non-unique-violation db error', async () => {
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('boom')),
          }),
        }),
      });

      const [result] = await service.updateMany([
        { id: sampleRow.id, name: 'New Name' },
      ]);

      expect(result).toEqual({
        id: sampleRow.id,
        success: false,
        error: 'Failed to save fragrance',
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

    it('reports success:false with "Fragrance not found" when no row matches the id', async () => {
      db.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const [result] = await service.removeMany(['missing-id']);

      expect(result).toEqual({
        id: 'missing-id',
        success: false,
        error: 'Fragrance not found',
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
        error: 'Failed to delete fragrance',
      });
    });

    // Spec: "Todas las respuestas de batch reportan resultado por ítem ...
    // partial-success por defecto" applies to every batch mutation without
    // exception, including delete. removeOne now mirrors createOne/updateOne:
    // a db error on one item is caught and reported per-item, so it never
    // aborts the rest of the batch via Promise.all.
    //
    // The FK violation this used to reproduce (deleting a fragrance still
    // referenced by a listing) can no longer happen at all: listings.fragranceId
    // is now `onDelete: 'cascade'` (see specs/fragrances-crud.md), so deleting
    // a fragrance cascades onto its listings instead of being rejected. This
    // test instead simulates a generic/unexpected db error to prove the
    // per-item isolation holds for delete regardless of the error's cause.
    it('isolates a single item db error from the rest of the batch', async () => {
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

      const results = await service.removeMany(['some-id', sampleRow.id]);

      expect(results).toEqual([
        {
          id: 'some-id',
          success: false,
          error: 'Failed to delete fragrance',
        },
        { id: sampleRow.id, success: true },
      ]);
    });
  });
});
