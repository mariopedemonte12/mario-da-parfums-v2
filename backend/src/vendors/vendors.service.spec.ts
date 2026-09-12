import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { and, ilike } from 'drizzle-orm';
import { VendorsService } from './vendors.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { vendors } from '../database/schema/vendor.schema.js';
import type { Vendor } from './entities/vendor.entity.js';

// Test design: see specs/vendors-crud.md (source of truth) +
// .claude/skills/testing/SKILL.md (BVA, decision tables, partial-success).
// Drizzle is mocked at the `db` boundary per backend/CLAUDE.md; `ilike`/`and`
// from drizzle-orm run for real so `where` composition can be asserted on.

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    name: 'Fragrantica Store',
    websiteUrl: 'https://www.example-store.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function uniqueViolation() {
  return Object.assign(new Error('duplicate key value'), { code: '23505' });
}

function fkViolation() {
  return Object.assign(new Error('foreign key violation'), { code: '23503' });
}

// The shape drizzle-orm (0.45.x) actually throws in production: a
// DrizzleQueryError whose own `.code` is undefined, wrapping the real pg
// error (which carries `.code`) on `.cause`. describeWriteError() has to
// unwrap `.cause` to find these — a mock that puts `.code` directly on the
// top-level error (like uniqueViolation()/fkViolation() above) would pass
// even if that unwrapping were deleted, since it never exercises it.
function wrappedUniqueViolation() {
  return Object.assign(new Error('Failed query'), { cause: uniqueViolation() });
}

function wrappedFkViolation() {
  return Object.assign(new Error('Failed query'), { cause: fkViolation() });
}

// Pinned so a mutant that swaps which pg error code maps to which message
// (name conflict vs. listing-referenced conflict) is caught — asserting
// only "some string" would let that swap through unnoticed.
const NAME_CONFLICT_ERROR = 'A vendor with that name already exists';
const LISTING_CONFLICT_ERROR = 'Vendor is referenced by existing listings';
const UNEXPECTED_ERROR = 'Unexpected error';
const NOT_FOUND_ERROR = 'Vendor not found';

// Mocks `db.select`, dispatching on whether it's the paginated data query
// (no args) or the count query (`select({ value: count() })`), and records
// the `where` value each branch received so it can be compared.
function makeSelectMock(dataRows: Vendor[], total: number) {
  const whereCalls: unknown[] = [];

  const select = vi.fn((arg?: unknown) => {
    if (arg) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn((where: unknown) => {
            whereCalls.push(where);
            return Promise.resolve([{ value: total }]);
          }),
        }),
      };
    }
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn((where: unknown) => {
          whereCalls.push(where);
          return {
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(dataRows),
            }),
          };
        }),
      }),
    };
  });

  return { select, whereCalls };
}

describe('VendorsService', () => {
  let service: VendorsService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  async function build(dbOverride: Partial<typeof db> = {}) {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...dbOverride,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorsService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  }

  beforeEach(async () => {
    await build();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    // Decision table: name present/absent x websiteUrl present/absent (2
    // independent conditions -> full combinatorial, 4 rows).
    it('queries with no filter when neither name nor websiteUrl is given', async () => {
      const rows = [makeVendor()];
      const { select, whereCalls } = makeSelectMock(rows, 1);
      await build({ select });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ data: rows, total: 1 });
      expect(whereCalls[0]).toBeUndefined();
      // Data query and count query must see the same filter, or totals and
      // rows could silently diverge.
      expect(whereCalls[1]).toEqual(whereCalls[0]);
    });

    it('builds a case-insensitive partial-match filter when only name is given', async () => {
      const { select, whereCalls } = makeSelectMock([], 0);
      await build({ select });

      await service.findAll({ name: 'frag', page: 1, limit: 20 });

      // Must be `ilike` (case-insensitive, partial) per spec, not `eq`
      // (exact match) — pins the operator, not just "some filter exists".
      // The service always composes conditions through `and(...)`, even for
      // a single condition, so the expected value must match that shape.
      expect(whereCalls[0]).toEqual(and(ilike(vendors.name, '%frag%')));
      expect(whereCalls[1]).toEqual(whereCalls[0]);
    });

    it('builds a case-insensitive partial-match filter when only websiteUrl is given', async () => {
      const { select, whereCalls } = makeSelectMock([], 0);
      await build({ select });

      await service.findAll({ websiteUrl: 'example', page: 1, limit: 20 });

      expect(whereCalls[0]).toEqual(
        and(ilike(vendors.websiteUrl, '%example%')),
      );
      expect(whereCalls[1]).toEqual(whereCalls[0]);
    });

    it('builds a combined filter when both name and websiteUrl are given', async () => {
      const { select, whereCalls } = makeSelectMock([], 0);
      await build({ select });

      await service.findAll({
        name: 'frag',
        websiteUrl: 'example',
        page: 1,
        limit: 20,
      });

      expect(whereCalls[0]).toEqual(
        and(
          ilike(vendors.name, '%frag%'),
          ilike(vendors.websiteUrl, '%example%'),
        ),
      );
      expect(whereCalls[1]).toEqual(whereCalls[0]);
    });

    // Offset math: page 1 -> offset 0; page > 1 -> (page - 1) * limit.
    it('computes offset 0 on the first page', async () => {
      let capturedOffset: number | undefined;
      const select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn((offset: number) => {
                capturedOffset = offset;
                return Promise.resolve([]);
              }),
            }),
          }),
        }),
      });
      const selectForCount = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      });
      await build({
        select: vi.fn((arg?: unknown) => (arg ? selectForCount() : select())),
      });

      await service.findAll({ page: 1, limit: 20 });

      expect(capturedOffset).toBe(0);
    });

    it('computes a non-zero offset on later pages', async () => {
      let capturedOffset: number | undefined;
      const select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn((offset: number) => {
                capturedOffset = offset;
                return Promise.resolve([]);
              }),
            }),
          }),
        }),
      });
      const selectForCount = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      });
      await build({
        select: vi.fn((arg?: unknown) => (arg ? selectForCount() : select())),
      });

      await service.findAll({ page: 3, limit: 10 });

      expect(capturedOffset).toBe(20);
    });

    it('defaults total to 0 when the count query returns no row', async () => {
      const select = vi.fn((arg?: unknown) => {
        if (arg) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };
      });
      await build({ select });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns the vendor when found', async () => {
      const vendor = makeVendor();
      await build({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([vendor]),
          }),
        }),
      });

      const result = await service.findOne(1);

      expect(result).toEqual(vendor);
    });

    it('throws NotFoundException when no vendor matches', async () => {
      await build({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createMany', () => {
    it('reports success with the new id for a single valid item', async () => {
      const vendor = makeVendor({ id: 5 });
      await build({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([vendor]),
          }),
        }),
      });

      const results = await service.createMany([
        { name: vendor.name, websiteUrl: vendor.websiteUrl },
      ]);

      expect(results).toEqual([{ id: 5, success: true }]);
    });

    it('fails only the item whose name collides with an existing DB row', async () => {
      const insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(uniqueViolation()),
        }),
      });
      await build({ insert });

      const results = await service.createMany([
        { name: 'Existing Vendor', websiteUrl: 'https://a.example.com' },
      ]);

      expect(results).toEqual([{ success: false, error: NAME_CONFLICT_ERROR }]);
      expect(results[0].id).toBeUndefined();
    });

    // Pins the actual DrizzleQueryError.cause unwrapping this PR fixes —
    // uniqueViolation() alone (used above) wouldn't catch a regression
    // back to reading err.code directly, since it puts .code on the
    // top-level error rather than wrapping it.
    it('fails with the name-conflict message when the db error is wrapped in .cause (real drizzle-orm shape)', async () => {
      const insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(wrappedUniqueViolation()),
        }),
      });
      await build({ insert });

      const results = await service.createMany([
        { name: 'Existing Vendor', websiteUrl: 'https://a.example.com' },
      ]);

      expect(results).toEqual([{ success: false, error: NAME_CONFLICT_ERROR }]);
    });

    it('fails only the later item that collides with an earlier item already committed in the same batch, leaving the rest to succeed', async () => {
      // Sequential for-loop: item[0] "commits" (mock resolves success),
      // item[1] shares its name so the DB unique constraint fires on it,
      // item[2] is independent and must still go through.
      const values = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi
            .fn()
            .mockResolvedValue([makeVendor({ id: 1, name: 'Dup' })]),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockRejectedValue(uniqueViolation()),
        })
        .mockReturnValueOnce({
          returning: vi
            .fn()
            .mockResolvedValue([makeVendor({ id: 2, name: 'Other' })]),
        });
      await build({ insert: vi.fn().mockReturnValue({ values }) });

      const results = await service.createMany([
        { name: 'Dup', websiteUrl: 'https://a.example.com' },
        { name: 'Dup', websiteUrl: 'https://b.example.com' },
        { name: 'Other', websiteUrl: 'https://c.example.com' },
      ]);

      // Same order as input items, partial success — one bad item doesn't
      // sink the batch or shift the remaining results.
      expect(results).toEqual([
        { id: 1, success: true },
        { success: false, error: NAME_CONFLICT_ERROR },
        { id: 2, success: true },
      ]);
    });

    it('reports an unexpected (non-Postgres) error without aborting the rest of the batch', async () => {
      const values = vi
        .fn()
        .mockReturnValueOnce({
          returning: vi.fn().mockRejectedValue(new Error('connection reset')),
        })
        .mockReturnValueOnce({
          returning: vi.fn().mockResolvedValue([makeVendor({ id: 7 })]),
        });
      await build({ insert: vi.fn().mockReturnValue({ values }) });

      const results = await service.createMany([
        { name: 'A', websiteUrl: 'https://a.example.com' },
        { name: 'B', websiteUrl: 'https://b.example.com' },
      ]);

      expect(results[0]).toEqual({ success: false, error: UNEXPECTED_ERROR });
      expect(results[1]).toEqual({ id: 7, success: true });
    });

    // Per-item schema validation (BVA on CreateVendorDto), run for real:
    // items are plain objects here (as everywhere else in this file), and
    // describeValidationError() runs them through plainToInstance before
    // validate(), so class-validator's decorators actually fire. A bad item
    // must fail only itself and never reach `insert` — asserted via the
    // insert spy never being called for it.
    it('fails an item with an empty name without calling insert, and does not abort the batch', async () => {
      const values = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeVendor({ id: 9 })]),
      });
      const insert = vi.fn().mockReturnValue({ values });
      await build({ insert });

      const results = await service.createMany([
        { name: '', websiteUrl: 'https://a.example.com' },
        { name: 'Valid', websiteUrl: 'https://b.example.com' },
      ]);

      expect(results[0].success).toBe(false);
      expect(results[0].id).toBeUndefined();
      expect(results[1]).toEqual({ id: 9, success: true });
      expect(values).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a'.repeat(129), 'name one char past the 128 boundary'],
      [12345 as unknown as string, 'a non-string name'],
    ])('fails an item with %s (%s) without calling insert', async (name) => {
      const insert = vi.fn();
      await build({ insert });

      const results = await service.createMany([
        { name, websiteUrl: 'https://a.example.com' },
      ]);

      expect(results).toEqual([
        { success: false, error: expect.any(String) },
      ]);
      expect(insert).not.toHaveBeenCalled();
    });

    it.each([
      [undefined as unknown as string, 'a missing websiteUrl'],
      ['not-a-url', 'an invalid websiteUrl format'],
      // Distinct failure mode from the plain-format case above: this is a
      // syntactically valid, absolute URL — it only fails because @IsUrl
      // is configured with protocols: ['http', 'https'].
      ['ftp://a.example.com', 'a disallowed protocol'],
    ])('fails an item with %s (%s) without calling insert', async (websiteUrl) => {
      const insert = vi.fn();
      await build({ insert });

      const results = await service.createMany([{ name: 'A', websiteUrl }]);

      expect(results).toEqual([
        { success: false, error: expect.any(String) },
      ]);
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe('updateMany', () => {
    it('updates an existing vendor successfully', async () => {
      const updated = makeVendor({ id: 1, name: 'New Name' });
      await build({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updated]),
            }),
          }),
        }),
      });

      const results = await service.updateMany([{ id: 1, name: 'New Name' }]);

      expect(results).toEqual([{ id: 1, success: true }]);
    });

    it('fails with a not-found error for an unknown id, without touching other items', async () => {
      const set = vi
        .fn()
        .mockReturnValueOnce({
          where: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 2 })]),
          }),
        });
      await build({ update: vi.fn().mockReturnValue({ set }) });

      const results = await service.updateMany([
        { id: 999, name: 'Ghost' },
        { id: 2, name: 'Real' },
      ]);

      expect(results).toEqual([
        { id: 999, success: false, error: NOT_FOUND_ERROR },
        { id: 2, success: true },
      ]);
    });

    it('fails with a conflict error when renaming to a name that collides with another vendor', async () => {
      await build({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(uniqueViolation()),
            }),
          }),
        }),
      });

      const results = await service.updateMany([{ id: 1, name: 'Taken' }]);

      expect(results).toEqual([
        { id: 1, success: false, error: NAME_CONFLICT_ERROR },
      ]);
    });

    // Same reasoning as the createMany wrapped-error test above: pins the
    // real DrizzleQueryError.cause shape, not just a top-level `.code`.
    it('fails with the name-conflict message when the db error is wrapped in .cause (real drizzle-orm shape)', async () => {
      await build({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(wrappedUniqueViolation()),
            }),
          }),
        }),
      });

      const results = await service.updateMany([{ id: 1, name: 'Taken' }]);

      expect(results).toEqual([
        { id: 1, success: false, error: NAME_CONFLICT_ERROR },
      ]);
    });

    // Regression: `UpdateVendorItemDto` allows an item with only `id` (both
    // name/websiteUrl are optional per PartialType), and Drizzle's
    // `.set({})` throws synchronously ("No values to set", confirmed by
    // spiking against the real query builder) rather than a no-op update.
    // That throw happens inside the per-item try/catch, so partial-success
    // isolation still holds — this pins that it fails gracefully instead of
    // aborting the batch, even though the resulting message is generic. See
    // testing findings: worth a clearer validation error, but out of scope
    // to fix silently here.
    it('fails gracefully (without aborting the batch) when an item has no fields to update', async () => {
      const set = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('No values to set');
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 2 })]),
          }),
        });
      await build({ update: vi.fn().mockReturnValue({ set }) });

      const results = await service.updateMany([
        { id: 1 },
        { id: 2, name: 'Real update' },
      ]);

      expect(results).toEqual([
        { id: 1, success: false, error: UNEXPECTED_ERROR },
        { id: 2, success: true },
      ]);
    });

    // Decision table: which subset of fields is patched (name only /
    // websiteUrl only / both) — each row asserts `set` receives exactly the
    // fields that were sent, nothing else.
    it.each([
      [{ id: 1, name: 'Only Name' }, { name: 'Only Name' }],
      [
        { id: 1, websiteUrl: 'https://only-url.example.com' },
        { websiteUrl: 'https://only-url.example.com' },
      ],
      [
        { id: 1, name: 'Both', websiteUrl: 'https://both.example.com' },
        { name: 'Both', websiteUrl: 'https://both.example.com' },
      ],
    ])(
      'passes only the provided fields to set() for %j',
      async (item, expectedChanges) => {
        const setSpy = vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 1 })]),
          }),
        });
        await build({ update: vi.fn().mockReturnValue({ set: setSpy }) });

        await service.updateMany([item]);

        expect(setSpy).toHaveBeenCalledWith(expectedChanges);
      },
    );

    // Per-item schema validation (BVA on UpdateVendorItemDto), run for
    // real — same reasoning as createMany's validation block above.
    it('fails an item whose name is one char past the 128 boundary without calling update, and does not abort the batch', async () => {
      const update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 2 })]),
          }),
        }),
      });
      await build({ update });

      const results = await service.updateMany([
        { id: 1, name: 'a'.repeat(129) },
        { id: 2, name: 'Valid rename' },
      ]);

      expect(results[0]).toEqual({
        id: 1,
        success: false,
        error: expect.any(String),
      });
      expect(results[1]).toEqual({ id: 2, success: true });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('fails an item with a non-integer id without calling update', async () => {
      const update = vi.fn();
      await build({ update });

      const results = await service.updateMany([
        { id: 1.5, name: 'Whatever' },
      ]);

      expect(results[0]).toMatchObject({ success: false });
      expect(update).not.toHaveBeenCalled();
    });

    // Distinct boundary from the non-integer case above: id absent
    // entirely, not just the wrong type.
    it('fails an item missing id entirely, without calling update', async () => {
      const update = vi.fn();
      await build({ update });

      const results = await service.updateMany([
        { name: 'No id' } as unknown as { id: number; name: string },
      ]);

      expect(results[0]).toMatchObject({ success: false, id: undefined });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('removeMany', () => {
    it('deletes an existing vendor successfully', async () => {
      await build({
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 1 })]),
          }),
        }),
      });

      const results = await service.removeMany([1]);

      expect(results).toEqual([{ id: 1, success: true }]);
    });

    it('fails with a not-found error for an unknown id, without affecting the rest', async () => {
      const del = vi
        .fn()
        .mockReturnValueOnce({
          where: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([makeVendor({ id: 2 })]),
          }),
        });
      await build({ delete: del });

      const results = await service.removeMany([999, 2]);

      expect(results).toEqual([
        { id: 999, success: false, error: NOT_FOUND_ERROR },
        { id: 2, success: true },
      ]);
    });

    it('fails with a conflict error when the vendor is referenced by an existing listing (FK violation)', async () => {
      await build({
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(fkViolation()),
          }),
        }),
      });

      const results = await service.removeMany([1]);

      expect(results).toEqual([
        { id: 1, success: false, error: LISTING_CONFLICT_ERROR },
      ]);
    });

    // Same reasoning as the createMany/updateMany wrapped-error tests
    // above: pins the real DrizzleQueryError.cause shape.
    it('fails with the listing-conflict message when the db error is wrapped in .cause (real drizzle-orm shape)', async () => {
      await build({
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(wrappedFkViolation()),
          }),
        }),
      });

      const results = await service.removeMany([1]);

      expect(results).toEqual([
        { id: 1, success: false, error: LISTING_CONFLICT_ERROR },
      ]);
    });
  });
});
