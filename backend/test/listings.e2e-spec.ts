import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, inArray } from 'drizzle-orm';
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
const { fragrances } =
  await import('../src/database/schema/fragrance.schema.js');
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
    const { customValidationPipe } =
      await import('../src/pipes/custom-validation.pipe.js');
    const { AllExceptionsFilter } =
      await import('../src/common/filters/http-exception.filter.js');
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
    await db
      .delete(fragrances)
      .where(inArray(fragrances.id, [fragranceA.id, fragranceB.id]));
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
      expect(res.body).toHaveProperty('nextCursor');
      expect(res.body).not.toHaveProperty('meta');
      expect(res.body).not.toHaveProperty('total');
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

    // :id goes through ParseIntPipe (real Nest pipeline, not just the DTO
    // validation layer covered by unit tests), so a non-numeric id should
    // be rejected as a 400, not silently coerced or mistaken for 404.
    it('GET /listings/:id returns 400 for a non-numeric id', async () => {
      await request(app.getHttpServer())
        .get('/listings/not-a-number')
        .expect(400);
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
      // Real 23505 unique-violation on (vendorId, fragranceId, sizeMl),
      // surfaced through describeWriteError()'s pgErrorCode() lookup, which
      // checks both err.code and err.cause.code (drizzle-orm 0.45.x wraps
      // real driver errors in a DrizzleQueryError whose .code lives on
      // .cause, not on the error itself — see the fix in listings.service.ts
      // and this session's closing report for the pre-existing bug this
      // e2e test caught, that a mocked-error unit test could not).
      expect(res.body.results[1]).toEqual({
        success: false,
        error: 'A listing for this vendor/fragrance/size already exists',
      });
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
      // Real 23503 FK violations (bad vendorId, then bad fragranceId), via
      // the pgErrorCode() fix noted above.
      expect(res.body.results[1]).toEqual({
        success: false,
        error: 'Fragrance or vendor not found',
      });
      expect(res.body.results[2]).toEqual({
        success: false,
        error: 'Fragrance or vendor not found',
      });
    });

    // Distinct from the pre-seeded-duplicate test above: here neither row
    // exists before the request, so the conflict can only be produced by
    // the *first* item's own insert landing in the same transaction/request
    // before the second item is processed — real sequential DB behavior a
    // mocked db (or a db that only checks pre-existing state) wouldn't
    // reproduce.
    it('reports the second of two identical items in the same batch as a conflict against the first', async () => {
      const res = await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem(), validItem()] })
        .expect(201);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].success).toBe(true);
      expect(res.body.results[1]).toEqual({
        success: false,
        error: 'A listing for this vendor/fragrance/size already exists',
      });
    });

    // The partial-success shape only applies to per-item business-rule
    // failures (unique/FK violations, as above). A structurally invalid
    // item fails class-validator's nested @ValidateNested check on the
    // whole BatchCreateListingsDto, so the request never reaches the
    // service at all — per docs/error-handling.md, that's a single 400 for
    // the whole request, not a 201 with one failing result. This is a real
    // pipeline-wiring behavior (global ValidationPipe + nested DTO), not
    // something a mocked-service unit test can observe.
    it('rejects the whole batch with 400 when one item is structurally invalid, unlike a business-rule failure', async () => {
      const res = await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [validItem(), { ...validItem(), price: -1 }],
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body).not.toHaveProperty('results');
    });

    it('rejects an empty items array with 400 (ArrayMinSize, wired end to end)', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [] })
        .expect(400);
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

      expect(res.body.results[0]).toEqual({
        id: toUpdate.id,
        success: false,
        error: 'A listing for this vendor/fragrance/size already exists',
      });
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

    // Same wiring distinction as the POST block: a structurally invalid
    // item (missing id) fails whole-request DTO validation (400), it is not
    // reported as a per-item failure in a 200 partial-success body.
    it('rejects the whole batch with 400 when one item is missing its id', async () => {
      const [created] = await db
        .insert(listings)
        .values(validItem())
        .returning();

      const res = await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: created.id, price: 1 }, { price: 2 }] })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body).not.toHaveProperty('results');
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

    it('rejects an empty ids array with 400 (ArrayMinSize, wired end to end)', async () => {
      await request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] })
        .expect(400);
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
      await db
        .insert(listings)
        .values([
          validItem({
            vendorId: vendorA.id,
            fragranceId: fragranceA.id,
            sizeMl: 30,
            price: 10000,
            inStock: true,
          }),
          validItem({
            vendorId: vendorA.id,
            fragranceId: fragranceA.id,
            sizeMl: 50,
            price: 20000,
            inStock: false,
          }),
          validItem({
            vendorId: vendorA.id,
            fragranceId: fragranceB.id,
            sizeMl: 30,
            price: 15000,
            inStock: true,
          }),
          validItem({
            vendorId: vendorB.id,
            fragranceId: fragranceA.id,
            sizeMl: 30,
            price: 30000,
            inStock: true,
          }),
          validItem({
            vendorId: vendorB.id,
            fragranceId: fragranceB.id,
            sizeMl: 100,
            price: 90000,
            inStock: false,
          }),
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

      expect(res.body.data.every((l: any) => l.vendorId === vendorB.id)).toBe(
        true,
      );
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

    // Decision-table gap: minPrice/maxPrice are documented as independently
    // optional, but the only prior coverage supplied both together. These
    // two isolate each one supplied alone against the same vendorA fixture
    // (prices 10000/20000/15000), so a filter that's silently ignored when
    // its partner is absent — or one that implicitly requires both — would
    // be caught here.
    it('filters by minPrice alone (no maxPrice)', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, minPrice: 15000, limit: 100 })
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((l: any) => l.price >= 15000)).toBe(true);
    });

    it('filters by maxPrice alone (no minPrice)', async () => {
      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, maxPrice: 15000, limit: 100 })
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((l: any) => l.price <= 15000)).toBe(true);
    });

    it('rejects an invalid query param with 400 (limit above the documented max)', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ limit: 101 })
        .expect(400);
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

    // vendorA has exactly 3 rows in this block's fixture (prices
    // 10000/20000/15000). specs/query-performance.md section 3: cursor
    // pagination replaces page/meta.total for listings; nextCursor is set
    // exactly when the page comes back with `limit` rows, null exactly when
    // shorter.
    it('nextCursor is set when the page is exactly full, and following it exhausts the rows with no dup/skip', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, limit: 2 })
        .expect(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.nextCursor).toBe(page1.body.data[1].id);
      expect(page1.body).not.toHaveProperty('meta');

      const page2 = await request(app.getHttpServer())
        .get('/listings')
        .query({
          vendorId: vendorA.id,
          limit: 2,
          cursor: page1.body.nextCursor,
        })
        .expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const idsPage1 = page1.body.data.map((l: any) => l.id);
      const idsPage2 = page2.body.data.map((l: any) => l.id);
      expect(idsPage1.some((id: number) => idsPage2.includes(id))).toBe(false);
      expect([...idsPage1, ...idsPage2].sort()).toEqual(
        idsPage1.concat(idsPage2).sort(),
      );
    });

    it('the cursor of the last real row returns an empty page with nextCursor: null', async () => {
      const full = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, limit: 100 })
        .expect(200);
      expect(full.body.nextCursor).toBeNull();
      const lastId = full.body.data[full.body.data.length - 1].id;

      const res = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, cursor: lastId, limit: 100 })
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('the cursor condition composes with vendorId + minPrice via AND', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: vendorA.id, minPrice: 10000, limit: 1 })
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/listings')
        .query({
          vendorId: vendorA.id,
          minPrice: 10000,
          limit: 10,
          cursor: page1.body.nextCursor,
        })
        .expect(200);

      expect(
        page2.body.data.every(
          (l: any) => l.vendorId === vendorA.id && l.price >= 10000,
        ),
      ).toBe(true);
    });
  });

  describe('GET /listings — cursor validation', () => {
    it('rejects a non-integer cursor with 400', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ cursor: 'not-an-int' })
        .expect(400);
    });

    it('rejects cursor=0 (below the @Min(1) boundary) with 400', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ cursor: 0 })
        .expect(400);
    });

    it('a well-formed but non-existent cursor id does not error', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ cursor: 999_999_999 })
        .expect(200);
    });
  });

  describe('schema-level FK behavior — only observable against real Postgres', () => {
    // fragranceId is declared `onDelete: 'cascade'`; vendorId has no
    // onDelete clause (default NO ACTION/RESTRICT). These two tests confirm
    // that asymmetry is actually enforced by the real constraint, not just
    // declared in the schema file — a mocked db can't fail a delete for a
    // reason it was never told to enforce.
    it('cascades: deleting the referenced fragrance deletes its listings', async () => {
      const [freshFragrance] = await db
        .insert(fragrances)
        .values({ name: `E2E Cascade Fragrance ${suffix}`, brand: 'E2E Brand' })
        .returning();
      const [created] = await db
        .insert(listings)
        .values(validItem({ fragranceId: freshFragrance.id }))
        .returning();

      await db.delete(fragrances).where(eq(fragrances.id, freshFragrance.id));

      await request(app.getHttpServer())
        .get(`/listings/${created.id}`)
        .expect(404);
    });

    it('restricts: deleting a vendor that still has listings is rejected at the DB level', async () => {
      const [freshVendor] = await db
        .insert(vendors)
        .values({
          name: `E2E Restrict Vendor ${suffix}`,
          websiteUrl: 'https://vendor-restrict.example.com',
        })
        .returning();
      const [created] = await db
        .insert(listings)
        .values(validItem({ vendorId: freshVendor.id }))
        .returning();

      await expect(
        db.delete(vendors).where(eq(vendors.id, freshVendor.id)),
      ).rejects.toThrow();

      // Cleanup: remove the listing before the vendor, since the FK is
      // exactly what just blocked deleting the vendor directly.
      await db.delete(listings).where(eq(listings.id, created.id));
      await db.delete(vendors).where(eq(vendors.id, freshVendor.id));
    });
  });
});
