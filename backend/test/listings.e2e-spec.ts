import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';

// Runs the listings module against a real Postgres (docker-compose.yml —
// container must already be up) instead of a mocked db, per the testing
// skill's scope gate: the business rules that matter here (the
// (vendorId, fragranceId, sizeMl) unique constraint, the fragranceId/
// vendorId FK constraints, and server-side filtering/pagination) only
// surface for real against an actual database — a mocked service (as in
// listings.controller.spec.ts) can't exercise them. Defaults let this run
// without a committed .env; override via real env vars for CI/other setups.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { listings } = await import('../src/database/schema/listing.schema.js');
const { fragrances } = await import(
  '../src/database/schema/fragrance.schema.js'
);
const { vendors } = await import('../src/database/schema/vendor.schema.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

describe('Listings (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let db: any;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;

  let vendorA: { id: number };
  let vendorB: { id: number };
  let fragranceA: { id: string };
  let fragranceB: { id: string };

  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const { customValidationPipe } = await import(
      '../src/pipes/custom-validation.pipe.js'
    );
    const { AllExceptionsFilter } = await import(
      '../src/common/filters/http-exception.filter.js'
    );
    app.useGlobalPipes(customValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    db = app.get(DRIZZLE);
    jwtService = app.get(JwtService);

    adminToken = jwtService.sign({
      sub: 1,
      email: 'admin@example.com',
      role: Role.ADMIN,
    });
    userToken = jwtService.sign({
      sub: 2,
      email: 'user@example.com',
      role: Role.USER,
    });

    [vendorA] = await db
      .insert(vendors)
      .values({
        name: `E2E Vendor A ${suffix}`,
        websiteUrl: 'https://vendor-a.example.com',
      })
      .returning();
    [vendorB] = await db
      .insert(vendors)
      .values({
        name: `E2E Vendor B ${suffix}`,
        websiteUrl: 'https://vendor-b.example.com',
      })
      .returning();
    [fragranceA] = await db
      .insert(fragrances)
      .values({ name: `E2E Fragrance A ${suffix}`, brand: 'E2E Brand' })
      .returning();
    [fragranceB] = await db
      .insert(fragrances)
      .values({ name: `E2E Fragrance B ${suffix}`, brand: 'E2E Brand' })
      .returning();
  });

  afterEach(async () => {
    // Listings own no state across tests; each test cleans up rows scoped
    // to the fixture vendors so failures/duplicates in one test never leak
    // into the next.
    await db
      .delete(listings)
      .where(inArray(listings.vendorId, [vendorA.id, vendorB.id]));
  });

  afterAll(async () => {
    await db.delete(fragrances).where(
      inArray(fragrances.id, [fragranceA.id, fragranceB.id]),
    );
    await db
      .delete(vendors)
      .where(inArray(vendors.id, [vendorA.id, vendorB.id]));
    await app.close();
  });

  function validItem(overrides: Record<string, unknown> = {}) {
    return {
      fragranceId: fragranceA.id,
      vendorId: vendorA.id,
      sizeMl: 100,
      price: 50000,
      url: 'https://vendor-a.example.com/products/x-100ml',
      ...overrides,
    };
  }

  describe('GET /listings and /listings/:id — public access', () => {
    it('GET /listings requires no Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('GET /listings/:id requires no Authorization header and returns the real row', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      const res = await request(app.getHttpServer())
        .get(`/listings/${created.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: created.id,
        fragranceId: fragranceA.id,
        vendorId: vendorA.id,
        sizeMl: 100,
        price: 50000,
      });
    });

    it('GET /listings/:id returns 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/listings/2147483647')
        .expect(404);
    });

    // Discriminating test (found via mutation testing): with only a single
    // fixture row present, a mutant that drops the id filter entirely
    // (e.g. always-true WHERE, returning "any" row) would still pass every
    // other test in this file, since there'd be nothing else for it to
    // wrongly return. Two distinct rows makes the id filter's own
    // correctness observable.
    it('returns the row matching :id specifically, not just any row', async () => {
      const [first] = await db
        .insert(listings)
        .values(validItem({ sizeMl: 30, price: 11111 }))
        .returning();
      const [second] = await db
        .insert(listings)
        .values(validItem({ sizeMl: 40, price: 22222 }))
        .returning();

      const res = await request(app.getHttpServer())
        .get(`/listings/${second.id}`)
        .expect(200);

      expect(res.body.id).toBe(second.id);
      expect(res.body.id).not.toBe(first.id);
      expect(res.body.price).toBe(22222);
    });
  });

  describe('POST /listings/batch — real unique + FK constraints', () => {
    it('rejects without a token (401) and rejects a non-admin token (403), end to end', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .send({ items: [validItem()] })
        .expect(401);

      await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [validItem()] })
        .expect(403);
    });

    it('creates a listing as admin and it becomes visible via GET /listings/:id', async () => {
      const res = await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem()] })
        .expect(201);

      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].success).toBe(true);
      const id = res.body.results[0].id;

      await request(app.getHttpServer()).get(`/listings/${id}`).expect(200);
    });

    it('reports a real duplicate (vendorId, fragranceId, sizeMl) as a per-item failure without aborting the batch', async () => {
      // Seed the first row directly so the batch's own duplicate is against
      // a real, pre-existing row (not just an internal same-batch clash).
      await db.insert(listings).values(validItem()).returning();

      const res = await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            validItem({ vendorId: vendorB.id }), // valid, different vendor
            validItem(), // duplicate of the seeded row
          ],
        })
        .expect(201);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].success).toBe(true);
      // KNOWN BUG (found by this e2e test, not visible under a mocked db):
      // describeWriteError()'s isPgError() checks `'code' in err` on the
      // top-level error, but this drizzle-orm version (0.45.x) wraps every
      // real driver error in a DrizzleQueryError whose `.code` is on
      // `err.cause.code`, not `err.code`. So every real unique/FK violation
      // silently falls through to the generic 'Unexpected error' branch —
      // the specific spec-documented messages below are currently
      // unreachable in production. The batch-isolation guarantee itself
      // still holds (this item's own failure doesn't abort the batch), only
      // the message text is wrong. The same isPgError/isUniqueViolation
      // pattern exists verbatim in vendors.service.ts and
      // fragrances.service.ts, so this is a pre-existing, repo-wide defect
      // inherited by this module, not something new introduced here.
      expect(res.body.results[1]).toMatchObject({ success: false });
      expect(res.body.results[1].error).toMatch(/already exists/i);
    });

    it('reports an unknown fragranceId/vendorId as a per-item FK failure without aborting the batch', async () => {
      const res = await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            validItem(),
            validItem({ vendorId: 999999999, sizeMl: 999 }),
            validItem({ fragranceId: randomUUID(), sizeMl: 998 }),
          ],
        })
        .expect(201);

      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0].success).toBe(true);
      // See the "KNOWN BUG" comment above: currently reports
      // 'Unexpected error' for both, not the spec-documented message.
      expect(res.body.results[1]).toMatchObject({
        success: false,
        error: 'Fragrance or vendor not found',
      });
      expect(res.body.results[2]).toMatchObject({
        success: false,
        error: 'Fragrance or vendor not found',
      });
    });
  });

  describe('PATCH /listings/batch — real constraints on update', () => {
    it('updates price/inStock and bumps scrapedAt', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem({ price: 10000 }))
        .returning();
      const originalScrapedAt = new Date(created.scrapedAt).getTime();

      // Ensure the clock actually advances between insert and update.
      await new Promise((r) => setTimeout(r, 5));

      const res = await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: created.id, price: 20000, inStock: false }] })
        .expect(200);

      expect(res.body.results[0]).toEqual({ id: created.id, success: true });

      const getRes = await request(app.getHttpServer())
        .get(`/listings/${created.id}`)
        .expect(200);
      expect(getRes.body.price).toBe(20000);
      expect(getRes.body.inStock).toBe(false);
      expect(new Date(getRes.body.scrapedAt).getTime()).toBeGreaterThan(
        originalScrapedAt,
      );
    });

    it('reports moving to an existing (vendorId, fragranceId, sizeMl) combo as a per-item conflict', async () => {
      const [existing] = await db
        .insert(listings)
        .values(validItem({ sizeMl: 50 }))
        .returning();
      const [toUpdate] = await db
        .insert(listings)
        .values(validItem({ sizeMl: 75 }))
        .returning();

      const res = await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: toUpdate.id, sizeMl: existing.sizeMl }] })
        .expect(200);

      // See the "KNOWN BUG" comment in the POST /listings/batch block above
      // (isPgError doesn't unwrap DrizzleQueryError.cause.code): currently
      // reports 'Unexpected error', not the spec-documented message.
      expect(res.body.results[0]).toMatchObject({
        id: toUpdate.id,
        success: false,
      });
      expect(res.body.results[0].error).toMatch(/already exists/i);
    });

    it('reports an unknown id as a per-item not-found', async () => {
      const res = await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: 2147483647, price: 1000 }] })
        .expect(200);

      expect(res.body.results[0]).toEqual({
        id: 2147483647,
        success: false,
        error: 'Listing not found',
      });
    });

    it('reports repointing to an unknown vendorId as a per-item FK failure', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      const res = await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: created.id, vendorId: 999999999 }] })
        .expect(200);

      // See the "KNOWN BUG" comment in the POST /listings/batch block above:
      // currently reports 'Unexpected error', not the spec-documented
      // message.
      expect(res.body.results[0]).toEqual({
        id: created.id,
        success: false,
        error: 'Fragrance or vendor not found',
      });
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      await request(app.getHttpServer())
        .patch('/listings/batch')
        .send({ items: [{ id: created.id, price: 1 }] })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [{ id: created.id, price: 1 }] })
        .expect(403);
    });
  });

  describe('DELETE /listings/batch', () => {
    it('deletes an existing listing and reports an unknown id in the same batch as not-found', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      const res = await request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [created.id, 2147483647] })
        .expect(200);

      expect(res.body.results).toEqual([
        { id: created.id, success: true },
        { id: 2147483647, success: false, error: 'Listing not found' },
      ]);

      await request(app.getHttpServer())
        .get(`/listings/${created.id}`)
        .expect(404);
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      await request(app.getHttpServer())
        .delete('/listings/batch')
        .send({ ids: [created.id] })
        .expect(401);

      await request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ids: [created.id] })
        .expect(403);
    });
  });

  describe('GET /listings — server-side filtering and pagination against real rows', () => {
    // Reseeded before every test in this block (not beforeAll): the
    // top-level afterEach wipes all listings scoped to the fixture vendors
    // after each test, so a one-time beforeAll would leave every test after
    // the first with no rows to filter against.
    beforeEach(async () => {
      // A deliberately mixed fixture set: two fragrances x two vendors x
      // various sizes/prices/stock statuses, so each filter (and
      // combinations of them) has both matching and non-matching rows to
      // discriminate against — a filter that's silently ignored, or one
      // that's too broad/narrow, would still pass a fixture with only
      // matching rows.
      await db.insert(listings).values([
        validItem({ vendorId: vendorA.id, fragranceId: fragranceA.id, sizeMl: 30, price: 10000, inStock: true }),
        validItem({ vendorId: vendorA.id, fragranceId: fragranceA.id, sizeMl: 50, price: 20000, inStock: false }),
        validItem({ vendorId: vendorA.id, fragranceId: fragranceB.id, sizeMl: 30, price: 15000, inStock: true }),
        validItem({ vendorId: vendorB.id, fragranceId: fragranceA.id, sizeMl: 30, price: 30000, inStock: true }),
        validItem({ vendorId: vendorB.id, fragranceId: fragranceB.id, sizeMl: 100, price: 90000, inStock: false }),
      ]);
    });

    it('filters by fragranceId alone', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ fragranceId: fragranceB.id, limit: 100 })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(
        res.body.data.every((l: any) => l.fragranceId === fragranceB.id),
      ).toBe(true);
    });

    it('filters by vendorId alone', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorB.id, limit: 100 })
        .expect(200);

      expect(
        res.body.data.every((l: any) => l.vendorId === vendorB.id),
      ).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by inStock: false', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, inStock: 'false', limit: 100 })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((l: any) => l.inStock === false)).toBe(true);
    });

    it('filters by minPrice/maxPrice inclusive range', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({
          vendorId: vendorA.id,
          minPrice: 15000,
          maxPrice: 20000,
          limit: 100,
        })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(
        res.body.data.every((l: any) => l.price >= 15000 && l.price <= 20000),
      ).toBe(true);
    });

    it('combines fragranceId + vendorId + inStock + minPrice + maxPrice all at once', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({
          fragranceId: fragranceA.id,
          vendorId: vendorA.id,
          inStock: 'true',
          minPrice: 5000,
          maxPrice: 15000,
          limit: 100,
        })
        .expect(200);

      // Exactly the sizeMl:30/price:10000/inStock:true row should match;
      // the sizeMl:50/price:20000/inStock:false row for the same
      // vendor+fragrance must be excluded by the combined filter.
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        vendorId: vendorA.id,
        fragranceId: fragranceA.id,
        sizeMl: 30,
        price: 10000,
        inStock: true,
      });
    });

    it('paginates: limit constrains page size and total reflects the full filtered count', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, limit: 2, page: 1 })
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, limit: 2, page: 2 })
        .expect(200);

      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.meta.total).toBe(3);
      expect(page1.body.meta.totalPages).toBe(2);
      expect(page2.body.data.length).toBeGreaterThanOrEqual(1);

      const idsPage1 = page1.body.data.map((l: any) => l.id);
      const idsPage2 = page2.body.data.map((l: any) => l.id);
      expect(idsPage1.some((id: number) => idsPage2.includes(id))).toBe(
        false,
      );
    });

    it('a page beyond the available data returns an empty data array with correct meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, limit: 2, page: 999 })
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(3);
    });
  });
});
