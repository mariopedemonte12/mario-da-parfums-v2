import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { FavoritesService } from './favorites.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { favorites } from '../database/schema/favorite.schema.js';
import { FragrancesService } from '../fragrances/fragrances.service.js';

// Test design: see specs/favorite-module.md (source of truth) +
// .claude/skills/testing/SKILL.md (BVA, decision tables, partial-success).
// Drizzle is mocked at the `db` boundary per backend/CLAUDE.md; `eq`/`and`
// from drizzle-orm run for real so `where` composition — in particular the
// per-user isolation clauses — can be asserted on precisely rather than by
// trusting the implementation's own wording.

function makeFragranceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Bleu de Chanel',
    brand: 'Chanel',
    concentration: 'Eau de Parfum',
    description: null,
    imageUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function uniqueViolation() {
  return Object.assign(new Error('duplicate key value'), { code: '23505' });
}

const FRAGRANCE_NOT_FOUND_ERROR = 'Fragrance not found';
const ALREADY_FAVORITED_ERROR = 'Fragrance already marked as favorite';
const SAVE_FAILED_ERROR = 'Failed to save favorite';
const FAVORITE_NOT_FOUND_ERROR = 'Favorite not found';
const REMOVE_FAILED_ERROR = 'Failed to remove favorite';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let fragrancesService: { findOne: ReturnType<typeof vi.fn> };

  async function build(
    dbOverride: Partial<typeof db> = {},
    fragrancesOverride: Partial<typeof fragrancesService> = {},
  ) {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      ...dbOverride,
    };
    fragrancesService = {
      findOne: vi.fn().mockResolvedValue(makeFragranceRow()),
      ...fragrancesOverride,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: DRIZZLE, useValue: db },
        { provide: FragrancesService, useValue: fragrancesService },
      ],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
  }

  beforeEach(async () => {
    await build();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllForUser', () => {
    // Mocks `db.select`. Both the data query and the count query pass an
    // explicit column-selection argument (unlike `vendors`, where only the
    // count query does), so dispatch can't key off "was an arg passed" —
    // instead it relies on the service building the `[dataQuery,
    // countQuery]` array literal left-to-right (both calls happen
    // synchronously, in that order, before `Promise.all` runs them), so the
    // 1st call is always the join/data query and the 2nd the count query.
    function makeSelectMock(
      rows: { id: number; createdAt: Date; fragrance: unknown }[],
      total: number,
    ) {
      const whereCalls: unknown[] = [];
      let call = 0;
      const select = vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn((where: unknown) => {
                  whereCalls.push(where);
                  return {
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockReturnValue({
                        execute: vi.fn().mockResolvedValue(rows),
                      }),
                    }),
                  };
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn((where: unknown) => {
              whereCalls.push(where);
              return { execute: vi.fn().mockResolvedValue([{ value: total }]) };
            }),
          }),
        };
      });
      return { select, whereCalls };
    }

    it('scopes both the data query and the count query to the caller (userId isolation)', async () => {
      const { select, whereCalls } = makeSelectMock([], 0);
      await build({ select });

      await service.findAllForUser(42, { page: 1, limit: 20 });

      // Pins the exact isolation clause: a mutant that drops the userId
      // filter (leaking every user's favorites) or filters on the wrong
      // column must fail this.
      expect(whereCalls[0]).toEqual(eq(favorites.userId, 42));
      expect(whereCalls[1]).toEqual(whereCalls[0]);
    });

    it('a different caller gets a different isolation clause', async () => {
      const { select, whereCalls } = makeSelectMock([], 0);
      await build({ select });

      await service.findAllForUser(7, { page: 1, limit: 20 });

      expect(whereCalls[0]).toEqual(eq(favorites.userId, 7));
      expect(whereCalls[0]).not.toEqual(eq(favorites.userId, 42));
    });

    // Offset math: page 1 -> offset 0; page > 1 -> (page - 1) * limit.
    function makeOffsetCapturingSelectMock(capture: (offset: number) => void) {
      let call = 0;
      return vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn((offset: number) => {
                      capture(offset);
                      return { execute: vi.fn().mockResolvedValue([]) };
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockReturnValue({
                execute: vi.fn().mockResolvedValue([{ value: 0 }]),
              }),
          }),
        };
      });
    }

    it('computes offset 0 on the first page (default query)', async () => {
      let capturedOffset: number | undefined;
      await build({
        select: makeOffsetCapturingSelectMock(
          (offset) => (capturedOffset = offset),
        ),
      });

      await service.findAllForUser(1, {});

      expect(capturedOffset).toBe(0);
    });

    it('computes a non-zero offset on later pages', async () => {
      let capturedOffset: number | undefined;
      await build({
        select: makeOffsetCapturingSelectMock(
          (offset) => (capturedOffset = offset),
        ),
      });

      await service.findAllForUser(1, { page: 3, limit: 10 });

      expect(capturedOffset).toBe(20);
    });

    it('defaults total to 0 when the count query returns no row', async () => {
      let call = 0;
      const selectWithEmptyCount = vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi
                      .fn()
                      .mockReturnValue({
                        execute: vi.fn().mockResolvedValue([]),
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
          }),
        };
      });
      await build({ select: selectWithEmptyCount });

      const result = await service.findAllForUser(1, { page: 1, limit: 20 });

      expect(result.total).toBe(0);
    });

    it('embeds the full fragrance data (not just its id) in each favorite, and echoes page/limit', async () => {
      const fragranceRow = makeFragranceRow({ name: 'Sauvage', brand: 'Dior' });
      const row = {
        id: 5,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        fragrance: fragranceRow,
      };
      const { select } = makeSelectMock([row], 1);
      await build({ select });

      const result = await service.findAllForUser(1, { page: 2, limit: 5 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 5,
        createdAt: row.createdAt,
        fragrance: { name: 'Sauvage', brand: 'Dior' },
      });
    });

    it('the embedded fragrance only exposes ResponseFragranceDto fields', async () => {
      const fragranceRow = makeFragranceRow({ internalSecret: 'do-not-leak' });
      const row = { id: 1, createdAt: new Date(), fragrance: fragranceRow };
      const { select } = makeSelectMock([row], 1);
      await build({ select });

      const result = await service.findAllForUser(1, { page: 1, limit: 20 });

      expect(result.data[0].fragrance).not.toHaveProperty('internalSecret');
    });

    it('returns an empty page when the caller has no favorites', async () => {
      const { select } = makeSelectMock([], 0);
      await build({ select });

      const result = await service.findAllForUser(1, { page: 1, limit: 20 });

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });
  });

  describe('getFavoritesCount', () => {
    it('delegates fragrance existence to FragrancesService and returns the count', async () => {
      const select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([{ value: 3 }]),
          }),
        }),
      });
      await build({ select });

      const result = await service.getFavoritesCount('frag-1');

      expect(fragrancesService.findOne).toHaveBeenCalledWith('frag-1');
      expect(result).toEqual({ fragranceId: 'frag-1', favoritesCount: 3 });
    });

    it('propagates NotFoundException when the fragrance does not exist, without querying favorites', async () => {
      const select = vi.fn();
      await build(
        { select },
        {
          findOne: vi
            .fn()
            .mockRejectedValue(new NotFoundException('Fragrance not found')),
        },
      );

      await expect(service.getFavoritesCount('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(select).not.toHaveBeenCalled();
    });

    it('defaults favoritesCount to 0 when no row is favorited', async () => {
      const select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
        }),
      });
      await build({ select });

      const result = await service.getFavoritesCount('frag-1');

      expect(result.favoritesCount).toBe(0);
    });
  });

  describe('createMany', () => {
    // Each entry keys its mocked behavior off the `fragranceId` argument
    // itself, not off call order — Promise.all() may interleave the
    // per-item async work, so ordering the mocks positionally would be
    // fragile. Assertions on the returned array still check exact
    // input-order preservation.
    function makeInsertMock(
      behaviors: Record<string, 'ok' | 'conflict' | 'error'>,
    ) {
      let nextId = 100;
      const values = vi.fn((row: { fragranceId: string }) => ({
        returning: vi.fn(() => {
          const behavior = behaviors[row.fragranceId] ?? 'ok';
          if (behavior === 'conflict') return Promise.reject(uniqueViolation());
          if (behavior === 'error')
            return Promise.reject(new Error('connection reset'));
          return Promise.resolve([{ id: nextId++, ...row }]);
        }),
      }));
      return vi.fn().mockReturnValue({ values });
    }

    function makeFindOneMock(missingIds: string[]) {
      return vi.fn((id: string) => {
        if (missingIds.includes(id)) {
          return Promise.reject(new NotFoundException('Fragrance not found'));
        }
        return Promise.resolve(makeFragranceRow({ id }));
      });
    }

    it('reports success with the new favorite id for a single valid item', async () => {
      await build(
        { insert: makeInsertMock({}) },
        { findOne: makeFindOneMock([]) },
      );

      const results = await service.createMany(1, ['frag-a']);

      expect(results).toEqual([
        { fragranceId: 'frag-a', success: true, id: 100 },
      ]);
    });

    it('fails with a not-found error when the fragrance does not exist, and never attempts the insert', async () => {
      const insert = makeInsertMock({});
      await build({ insert }, { findOne: makeFindOneMock(['ghost']) });

      const results = await service.createMany(1, ['ghost']);

      expect(results).toEqual([
        {
          fragranceId: 'ghost',
          success: false,
          error: FRAGRANCE_NOT_FOUND_ERROR,
        },
      ]);
      expect(insert).not.toHaveBeenCalled();
    });

    it('fails with a conflict error when the fragrance is already favorited by the caller', async () => {
      await build(
        { insert: makeInsertMock({ 'frag-a': 'conflict' }) },
        { findOne: makeFindOneMock([]) },
      );

      const results = await service.createMany(1, ['frag-a']);

      expect(results).toEqual([
        {
          fragranceId: 'frag-a',
          success: false,
          error: ALREADY_FAVORITED_ERROR,
        },
      ]);
      expect(results[0].id).toBeUndefined();
    });

    it('reports an unexpected (non-Postgres) error without a leaked id', async () => {
      await build(
        { insert: makeInsertMock({ 'frag-a': 'error' }) },
        { findOne: makeFindOneMock([]) },
      );

      const results = await service.createMany(1, ['frag-a']);

      expect(results).toEqual([
        { fragranceId: 'frag-a', success: false, error: SAVE_FAILED_ERROR },
      ]);
    });

    // Decision table: fragrance-missing x already-favorited x unexpected-error
    // x happy-path, all four in one batch — proves partial success holds the
    // input order and one bad item never sinks the rest.
    it('preserves input order and partial success across a mixed batch', async () => {
      await build(
        { insert: makeInsertMock({ dup: 'conflict', boom: 'error' }) },
        { findOne: makeFindOneMock(['ghost']) },
      );

      const results = await service.createMany(1, [
        'ghost',
        'dup',
        'boom',
        'ok',
      ]);

      expect(results).toEqual([
        {
          fragranceId: 'ghost',
          success: false,
          error: FRAGRANCE_NOT_FOUND_ERROR,
        },
        { fragranceId: 'dup', success: false, error: ALREADY_FAVORITED_ERROR },
        { fragranceId: 'boom', success: false, error: SAVE_FAILED_ERROR },
        { fragranceId: 'ok', success: true, id: 100 },
      ]);
    });

    it('inserts scoped to the caller: the row written carries the caller userId', async () => {
      const values = vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 1, userId: 42, fragranceId: 'frag-a' }]),
      });
      await build({ insert: vi.fn().mockReturnValue({ values }) });

      await service.createMany(42, ['frag-a']);

      expect(values).toHaveBeenCalledWith({
        userId: 42,
        fragranceId: 'frag-a',
      });
    });
  });

  describe('removeMany', () => {
    // `db.delete(favorites)` itself takes no arguments that distinguish
    // items, so behavior is keyed off `.where(...)`'s call order — safe
    // here because `removeOne` has no `await` before building the
    // delete/where/returning chain, so `.map()` invokes them in input order
    // even though the resulting promises then resolve concurrently.
    function makeDeleteMock(returningResults: (unknown[] | Error)[]) {
      const whereCalls: unknown[] = [];
      let call = 0;
      const where = vi.fn((clause: unknown) => {
        whereCalls.push(clause);
        const outcome = returningResults[call++];
        const returning = vi.fn(() =>
          outcome instanceof Error
            ? Promise.reject(outcome)
            : Promise.resolve(outcome),
        );
        return { returning };
      });
      return { del: vi.fn().mockReturnValue({ where }), whereCalls };
    }

    it('unmarks a favorite the caller owns', async () => {
      const { del } = makeDeleteMock([
        [{ id: 1, userId: 1, fragranceId: 'frag-a' }],
      ]);
      await build({ delete: del });

      const results = await service.removeMany(1, ['frag-a']);

      expect(results).toEqual([{ fragranceId: 'frag-a', success: true }]);
    });

    it('scopes the delete to both userId and fragranceId (isolation clause)', async () => {
      const { del, whereCalls } = makeDeleteMock([[]]);
      await build({ delete: del });

      await service.removeMany(42, ['frag-a']);

      // Pins the exact isolation clause: a mutant that drops the userId
      // condition (letting a caller unmark another user's favorite by
      // fragranceId alone) must fail this.
      expect(whereCalls[0]).toEqual(
        and(eq(favorites.userId, 42), eq(favorites.fragranceId, 'frag-a')),
      );
    });

    it('fails with a not-found error when the caller never favorited that fragrance, without aborting the rest', async () => {
      const { del } = makeDeleteMock([
        [],
        [{ id: 2, userId: 1, fragranceId: 'frag-b' }],
      ]);
      await build({ delete: del });

      const results = await service.removeMany(1, ['frag-a', 'frag-b']);

      expect(results).toEqual([
        {
          fragranceId: 'frag-a',
          success: false,
          error: FAVORITE_NOT_FOUND_ERROR,
        },
        { fragranceId: 'frag-b', success: true },
      ]);
    });

    // Isolation, black-box framing: a row exists in the table for
    // `fragranceId` but owned by a different user. Because the where clause
    // requires userId AND fragranceId (asserted above), the mock DB
    // correctly reports no match for the caller, and the caller sees this
    // exactly like "never favorited" — never like "someone else's".
    it('reports not-found (never leaks existence) when the fragranceId belongs to another user', async () => {
      const { del } = makeDeleteMock([[]]);
      await build({ delete: del });

      const results = await service.removeMany(1, ['someone-elses-favorite']);

      expect(results).toEqual([
        {
          fragranceId: 'someone-elses-favorite',
          success: false,
          error: FAVORITE_NOT_FOUND_ERROR,
        },
      ]);
    });

    it('reports an unexpected error without aborting the rest of the batch', async () => {
      const { del } = makeDeleteMock([
        new Error('connection reset'),
        [{ id: 2, userId: 1, fragranceId: 'frag-b' }],
      ]);
      await build({ delete: del });

      const results = await service.removeMany(1, ['frag-a', 'frag-b']);

      expect(results).toEqual([
        { fragranceId: 'frag-a', success: false, error: REMOVE_FAILED_ERROR },
        { fragranceId: 'frag-b', success: true },
      ]);
    });
  });
});
