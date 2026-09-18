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

// Runs the vendors module against a real Postgres (docker-compose.yml —
// container must already be up) instead of a mocked db, per the testing
// skill's scope gate: the business rules that matter here (the unique
// constraint on `name`, and the FK constraint from listings.vendorId that
// the spec says must block a delete rather than cascade) only surface for
// real against an actual database — a mocked service (as in
// vendors.controller.spec.ts / vendors.service.spec.ts) can't exercise
// them. Defaults let this run without a committed .env; override via real
// env vars for CI/other setups.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { vendors } = await import('../src/database/schema/vendor.schema.js');
const { listings } = await import('../src/database/schema/listing.schema.js');
const { fragrances } =
  await import('../src/database/schema/fragrance.schema.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

describe('Vendors (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let db: any;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;

  const suffix = randomUUID().slice(0, 8);
  const createdVendorIds: number[] = [];

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
  });

  afterEach(async () => {
    // Every test either tracks the vendor ids it creates (via the helper
    // below) or cleans up its own rows directly; this belt-and-suspenders
    // sweep keeps failures in one test from leaking fixture rows (and name
    // collisions) into the next.
    if (createdVendorIds.length > 0) {
      await db.delete(vendors).where(inArray(vendors.id, createdVendorIds));
      createdVendorIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueName(label: string) {
    return `E2E Vendor ${label} ${suffix} ${randomUUID().slice(0, 8)}`;
  }

  function validItem(overrides: Record<string, unknown> = {}) {
    return {
      name: uniqueName('X'),
      websiteUrl: 'https://vendor-x.example.com',
      ...overrides,
    };
  }

  async function insertVendor(overrides: Record<string, unknown> = {}) {
    const [row] = await db
      .insert(vendors)
      .values(validItem(overrides))
      .returning();
    createdVendorIds.push(row.id);
    return row;
  }

  // --- GET /vendors and /vendors/:id — public access -----------------

  describe('GET /vendors and /vendors/:id — public access', () => {
    it('GET /vendors requires no Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('GET /vendors/:id requires no Authorization header and returns the real row', async () => {
      const created = await insertVendor();

      const res = await request(app.getHttpServer())
        .get(`/vendors/${created.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: created.id,
        name: created.name,
        websiteUrl: created.websiteUrl,
      });
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
    });

    it('GET /vendors/:id returns 404 for a non-existent id', async () => {
      await request(app.getHttpServer()).get('/vendors/2147483647').expect(404);
    });

    // Two distinct rows makes the id filter's own correctness observable —
    // with only a single fixture row present, a mutant that dropped the id
    // filter entirely would still pass.
    it('returns the row matching :id specifically, not just any row', async () => {
      const first = await insertVendor({
        websiteUrl: 'https://first.example.com',
      });
      const second = await insertVendor({
        websiteUrl: 'https://second.example.com',
      });

      const res = await request(app.getHttpServer())
        .get(`/vendors/${second.id}`)
        .expect(200);

      expect(res.body.id).toBe(second.id);
      expect(res.body.id).not.toBe(first.id);
      expect(res.body.websiteUrl).toBe('https://second.example.com');
    });
  });

  // --- GET /vendors — filtering & pagination against real rows -------

  describe('GET /vendors — server-side filtering and pagination', () => {
    let alpha: { id: number };
    let beta: { id: number };
    let gamma: { id: number };

    beforeEach(async () => {
      // A deliberately mixed fixture set so name/websiteUrl filters (and
      // pagination on top of them) have both matching and non-matching
      // rows to discriminate against.
      alpha = await insertVendor({
        name: `E2E Filter Alpha ${suffix}`,
        websiteUrl: 'https://alpha-store.example.com',
      });
      beta = await insertVendor({
        name: `E2E Filter Beta ${suffix}`,
        websiteUrl: 'https://beta-store.example.com',
      });
      gamma = await insertVendor({
        name: `E2E Other Gamma ${suffix}`,
        websiteUrl: 'https://gamma-shop.example.com',
      });
    });

    it('filters by name (case-insensitive partial match)', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: `filter`, limit: 100 })
        .expect(200);

      const ids = res.body.data.map((v: any) => v.id);
      expect(ids).toEqual(expect.arrayContaining([alpha.id, beta.id]));
      expect(ids).not.toContain(gamma.id);
    });

    it('filters by websiteUrl (case-insensitive partial match)', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .query({ websiteUrl: 'STORE', limit: 100 })
        .expect(200);

      const ids = res.body.data.map((v: any) => v.id);
      expect(ids).toEqual(expect.arrayContaining([alpha.id, beta.id]));
      expect(ids).not.toContain(gamma.id);
    });

    it('combines name + websiteUrl filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: 'Filter Alpha', websiteUrl: 'alpha-store', limit: 100 })
        .expect(200);

      const ids = res.body.data.map((v: any) => v.id);
      expect(ids).toContain(alpha.id);
      expect(ids).not.toContain(beta.id);
      expect(ids).not.toContain(gamma.id);
    });

    it('paginates: limit constrains page size and total reflects the full filtered count', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: 'E2E Filter', limit: 1, page: 1 })
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: 'E2E Filter', limit: 1, page: 2 })
        .expect(200);

      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta.total).toBe(2);
      expect(page1.body.meta.totalPages).toBe(2);
      expect(page2.body.data).toHaveLength(1);

      const idsPage1 = page1.body.data.map((v: any) => v.id);
      const idsPage2 = page2.body.data.map((v: any) => v.id);
      expect(idsPage1).not.toEqual(idsPage2);
    });

    it('a page beyond the available data returns an empty data array with correct meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: 'E2E Filter', limit: 1, page: 999 })
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(2);
    });

    it('defaults to page 1 / limit 20 when omitted', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: 'E2E Filter' })
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(20);
    });
  });

  // --- BVA: FindVendorsDto page/limit boundaries ----------------------

  describe('GET /vendors — page/limit boundary values', () => {
    it('page: 1 is valid, 0 is rejected (400)', async () => {
      await request(app.getHttpServer())
        .get('/vendors')
        .query({ page: 1 })
        .expect(200);

      await request(app.getHttpServer())
        .get('/vendors')
        .query({ page: 0 })
        .expect(400);
    });

    it('limit: 1 is valid, 0 is rejected (400)', async () => {
      await request(app.getHttpServer())
        .get('/vendors')
        .query({ limit: 1 })
        .expect(200);

      await request(app.getHttpServer())
        .get('/vendors')
        .query({ limit: 0 })
        .expect(400);
    });

    it('limit: 100 is valid, 101 is rejected (400)', async () => {
      await request(app.getHttpServer())
        .get('/vendors')
        .query({ limit: 100 })
        .expect(200);

      await request(app.getHttpServer())
        .get('/vendors')
        .query({ limit: 101 })
        .expect(400);
    });
  });

  // --- Decision table: write endpoints x auth state -------------------
  //
  // | endpoint             | no token | user token | admin token |
  // |----------------------|----------|------------|-------------|
  // | POST /vendors/batch  | 401      | 403        | 201         |
  // | PATCH /vendors/batch | 401      | 403        | 200         |
  // | DELETE /vendors/batch| 401      | 403        | 200         |
  // (GET endpoints are public regardless of auth state — covered above.)

  describe('Write endpoints — auth/role decision table', () => {
    it('POST /vendors/batch: 401 with no token, 403 with a non-admin token', async () => {
      await request(app.getHttpServer())
        .post('/vendors/batch')
        .send({ items: [validItem()] })
        .expect(401);

      await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [validItem()] })
        .expect(403);
    });

    it('POST /vendors/batch: 201 with an admin token, and the vendor becomes visible via GET', async () => {
      const item = validItem();
      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [item] })
        .expect(201);

      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].success).toBe(true);
      const id = res.body.results[0].id;
      createdVendorIds.push(id);

      await request(app.getHttpServer()).get(`/vendors/${id}`).expect(200);
    });

    it('PATCH /vendors/batch: 401 with no token, 403 with a non-admin token', async () => {
      const created = await insertVendor();

      await request(app.getHttpServer())
        .patch('/vendors/batch')
        .send({ items: [{ id: created.id, name: uniqueName('renamed') }] })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [{ id: created.id, name: uniqueName('renamed') }] })
        .expect(403);
    });

    it('DELETE /vendors/batch: 401 with no token, 403 with a non-admin token', async () => {
      const created = await insertVendor();

      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .send({ ids: [created.id] })
        .expect(401);

      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ids: [created.id] })
        .expect(403);
    });
  });

  // --- BVA: CreateVendorDto boundaries ---------------------------------

  // Schema violations are per-item failures inside a 201/200 batch
  // response, not a global 400 — see the "partial success" describe block
  // below for why (a schema-invalid item must not sink its batch
  // siblings). Only the batch envelope itself (items non-empty) is still
  // globally validated (see the auth/role decision table's smoke checks).
  describe('POST /vendors/batch — CreateVendorDto boundary values', () => {
    it('name: empty string fails that item (VENDOR_NAME_REQUIRED), a single char succeeds', async () => {
      const badRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ name: '' })] })
        .expect(201);
      expect(badRes.body.results[0].success).toBe(false);
      expect(badRes.body.results[0].error).toMatch(/VENDOR_NAME_REQUIRED/);

      const okRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ name: uniqueName('a') })] })
        .expect(201);
      expect(okRes.body.results[0].success).toBe(true);
      createdVendorIds.push(okRes.body.results[0].id);
    });

    it('name: 128 chars succeeds, 129 chars fails that item (VENDOR_NAME_TOO_LONG)', async () => {
      // Keep the suffix so a rerun doesn't collide on a stale row, but pad
      // out to exactly the boundary length with filler characters.
      const base = `E2E MaxName ${suffix} `;
      const name128 = base.padEnd(128, 'a');
      const name129 = base.padEnd(129, 'a');
      expect(name128).toHaveLength(128);
      expect(name129).toHaveLength(129);

      const okRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ name: name128 })] })
        .expect(201);
      expect(okRes.body.results[0].success).toBe(true);
      createdVendorIds.push(okRes.body.results[0].id);

      const badRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ name: name129 })] })
        .expect(201);
      expect(badRes.body.results[0].success).toBe(false);
      expect(badRes.body.results[0].error).toMatch(/VENDOR_NAME_TOO_LONG/);
    });

    it('name: non-string type fails that item (VENDOR_NAME_INVALID_TYPE)', async () => {
      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ name: 12345 })] })
        .expect(201);
      expect(res.body.results[0].success).toBe(false);
      expect(res.body.results[0].error).toMatch(/VENDOR_NAME_INVALID_TYPE/);
    });

    it('websiteUrl: missing fails that item (VENDOR_WEBSITE_URL_REQUIRED)', async () => {
      const item = validItem();
      delete (item as any).websiteUrl;

      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [item] })
        .expect(201);
      expect(res.body.results[0].success).toBe(false);
      expect(res.body.results[0].error).toMatch(/VENDOR_WEBSITE_URL_REQUIRED/);
    });

    it('websiteUrl: an invalid format fails that item (VENDOR_WEBSITE_URL_INVALID_FORMAT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ websiteUrl: 'not-a-url' })] })
        .expect(201);
      expect(res.body.results[0].success).toBe(false);
      expect(res.body.results[0].error).toMatch(
        /VENDOR_WEBSITE_URL_INVALID_FORMAT/,
      );
    });

    it('websiteUrl: 255 chars succeeds, 256 chars fails that item (VENDOR_WEBSITE_URL_TOO_LONG)', async () => {
      // "https://example.com/" is 21 chars; pad the path with a run of
      // 'a's so both variants stay a syntactically valid URL and only the
      // MaxLen(255) boundary differs between them.
      const prefix = 'https://example.com/';
      const url255 = prefix + 'a'.repeat(255 - prefix.length);
      const url256 = prefix + 'a'.repeat(256 - prefix.length);
      expect(url255).toHaveLength(255);
      expect(url256).toHaveLength(256);

      const okRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ websiteUrl: url255 })] })
        .expect(201);
      expect(okRes.body.results[0].success).toBe(true);
      createdVendorIds.push(okRes.body.results[0].id);

      const badRes = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [validItem({ websiteUrl: url256 })] })
        .expect(201);
      expect(badRes.body.results[0].success).toBe(false);
      expect(badRes.body.results[0].error).toMatch(
        /VENDOR_WEBSITE_URL_TOO_LONG/,
      );
    });
  });

  // --- Mass-assignment: extra properties must never reach the db -------
  //
  // Regression coverage for a real bug found in code review: dropping
  // @ValidateNested (needed for per-item partial-success, above) also
  // drops the global pipe's whitelist stripping for these nested items —
  // without a replacement, a client-supplied `id`/`createdAt`/`updatedAt`
  // would be written verbatim (confirmed against a raw drizzle insert
  // during triage: an extra `id` in the payload silently became the row's
  // real primary key). VendorsService now sanitizes each item via
  // `plainToInstance(..., { excludeExtraneousValues: true })` against the
  // DTO's own `@Expose()` allowlist before writing — this is a real e2e
  // case, not mockable, since the mocked-service unit tests would still
  // pass an unsanitized item straight to the mocked db without ever
  // exercising the sanitization step itself.
  describe('POST/PATCH /vendors/batch — extra properties are stripped before writing', () => {
    it('ignores a client-supplied id and updatedAt on create — the real serial id and server clock win', async () => {
      const forcedId = 555555555;
      const forcedDate = '2000-01-01T00:00:00.000Z';

      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            validItem({
              id: forcedId,
              createdAt: forcedDate,
              updatedAt: forcedDate,
            }),
          ],
        })
        .expect(201);

      expect(res.body.results[0].success).toBe(true);
      const realId = res.body.results[0].id;
      expect(realId).not.toBe(forcedId);
      createdVendorIds.push(realId);

      const getRes = await request(app.getHttpServer())
        .get(`/vendors/${realId}`)
        .expect(200);
      expect(new Date(getRes.body.createdAt).getTime()).toBeGreaterThan(
        new Date(forcedDate).getTime(),
      );

      // The forced id must never have been used as a real row.
      await request(app.getHttpServer())
        .get(`/vendors/${forcedId}`)
        .expect(404);
    });

    it('ignores a client-supplied updatedAt/createdAt on update — the server clock wins', async () => {
      const created = await insertVendor();
      const forcedDate = '2000-01-01T00:00:00.000Z';

      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            {
              id: created.id,
              name: uniqueName('mass-assignment'),
              updatedAt: forcedDate,
              createdAt: forcedDate,
            },
          ],
        })
        .expect(200);

      expect(res.body.results[0]).toEqual({ id: created.id, success: true });

      const getRes = await request(app.getHttpServer())
        .get(`/vendors/${created.id}`)
        .expect(200);
      expect(new Date(getRes.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(forcedDate).getTime(),
      );
      expect(new Date(getRes.body.createdAt).getTime()).toBeGreaterThan(
        new Date(forcedDate).getTime(),
      );
    });
  });

  // --- POST /vendors/batch — partial success + real unique constraint -

  describe('POST /vendors/batch — partial success against real unique constraint', () => {
    it('a schema-invalid item in the batch fails only that item — the valid sibling still succeeds', async () => {
      const good = validItem();

      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [good, validItem({ name: '' })] })
        .expect(201);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toMatchObject({ success: true });
      createdVendorIds.push(res.body.results[0].id);
      expect(res.body.results[1]).toMatchObject({ success: false });
      expect(res.body.results[1].error).toMatch(/VENDOR_NAME_REQUIRED/);

      // The valid sibling item must actually have been persisted.
      const check = await request(app.getHttpServer())
        .get('/vendors')
        .query({ name: good.name })
        .expect(200);
      expect(check.body.data).toHaveLength(1);
    });

    it('reports a duplicate name against an existing DB row as a per-item conflict without aborting the batch', async () => {
      const existing = await insertVendor();

      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            validItem(), // distinct, should succeed
            validItem({ name: existing.name }), // duplicate of the seeded row
          ],
        })
        .expect(201);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].success).toBe(true);
      createdVendorIds.push(res.body.results[0].id);
      expect(res.body.results[1]).toMatchObject({
        success: false,
        error: 'A vendor with that name already exists',
      });
    });

    it('reports a duplicate name against an earlier item in the same batch as a per-item conflict', async () => {
      const name = uniqueName('same-batch-dup');

      const res = await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [validItem({ name }), validItem({ name })],
        })
        .expect(201);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].success).toBe(true);
      createdVendorIds.push(res.body.results[0].id);
      expect(res.body.results[1]).toMatchObject({
        success: false,
        error: 'A vendor with that name already exists',
      });
    });
  });

  // --- PATCH /vendors/batch — partial success + real constraints ------

  describe('PATCH /vendors/batch — partial success against real constraints', () => {
    it('updates name/websiteUrl and bumps updatedAt', async () => {
      const created = await insertVendor();
      const originalUpdatedAt = new Date(created.updatedAt).getTime();
      const newName = uniqueName('renamed');

      await new Promise((r) => setTimeout(r, 5));

      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            {
              id: created.id,
              name: newName,
              websiteUrl: 'https://renamed.example.com',
            },
          ],
        })
        .expect(200);

      expect(res.body.results[0]).toEqual({ id: created.id, success: true });

      const getRes = await request(app.getHttpServer())
        .get(`/vendors/${created.id}`)
        .expect(200);
      expect(getRes.body.name).toBe(newName);
      expect(getRes.body.websiteUrl).toBe('https://renamed.example.com');
      expect(new Date(getRes.body.updatedAt).getTime()).toBeGreaterThan(
        originalUpdatedAt,
      );
    });

    it('allows a partial update (name only, leaving websiteUrl unchanged)', async () => {
      const created = await insertVendor();
      const newName = uniqueName('partial');

      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: created.id, name: newName }] })
        .expect(200);

      expect(res.body.results[0]).toEqual({ id: created.id, success: true });

      const getRes = await request(app.getHttpServer())
        .get(`/vendors/${created.id}`)
        .expect(200);
      expect(getRes.body.name).toBe(newName);
      expect(getRes.body.websiteUrl).toBe(created.websiteUrl);
    });

    it('reports an unknown id as a per-item not-found', async () => {
      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: 2147483647, name: uniqueName('ghost') }] })
        .expect(200);

      expect(res.body.results[0]).toEqual({
        id: 2147483647,
        success: false,
        error: 'Vendor not found',
      });
    });

    it('reports renaming to a name that collides with another vendor as a per-item conflict, without affecting other items', async () => {
      const other = await insertVendor();
      const toUpdate = await insertVendor();
      const unrelated = await insertVendor();
      const unrelatedNewName = uniqueName('unrelated-renamed');

      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { id: toUpdate.id, name: other.name },
            { id: unrelated.id, name: unrelatedNewName },
          ],
        })
        .expect(200);

      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toEqual({
        id: toUpdate.id,
        success: false,
        error: 'A vendor with that name already exists',
      });
      // The sibling item in the same batch must still succeed.
      expect(res.body.results[1]).toEqual({
        id: unrelated.id,
        success: true,
      });

      const getRes = await request(app.getHttpServer())
        .get(`/vendors/${unrelated.id}`)
        .expect(200);
      expect(getRes.body.name).toBe(unrelatedNewName);
    });

    it('an unknown id and a valid update in the same batch: the unknown one fails, the valid one succeeds', async () => {
      const toUpdate = await insertVendor();
      const newName = uniqueName('valid-sibling');

      const res = await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { id: 2147483647, name: uniqueName('ghost2') },
            { id: toUpdate.id, name: newName },
          ],
        })
        .expect(200);

      expect(res.body.results[0]).toEqual({
        id: 2147483647,
        success: false,
        error: 'Vendor not found',
      });
      expect(res.body.results[1]).toEqual({ id: toUpdate.id, success: true });
    });
  });

  // --- DELETE /vendors/batch — partial success + real FK constraint ---

  describe('DELETE /vendors/batch — partial success, including the real FK constraint from listings', () => {
    it('deletes an existing vendor and reports an unknown id in the same batch as not-found', async () => {
      const created = await insertVendor();

      const res = await request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [created.id, 2147483647] })
        .expect(200);

      expect(res.body.results).toEqual([
        { id: created.id, success: true },
        { id: 2147483647, success: false, error: 'Vendor not found' },
      ]);
      // Already deleted — remove from the cleanup list so afterEach's
      // delete-by-id sweep doesn't error on a row that's already gone.
      createdVendorIds.length = 0;

      await request(app.getHttpServer())
        .get(`/vendors/${created.id}`)
        .expect(404);
    });

    // Real FK behavior (not mockable): a vendor referenced by an existing
    // listing must fail deletion instead of cascading, per the spec's "Out
    // of scope: cascading delete of a vendor's listings."
    it('refuses to delete a vendor referenced by an existing listing (FK conflict), without affecting other items in the batch', async () => {
      const referenced = await insertVendor();
      const unreferenced = await insertVendor();
      const [fragrance] = await db
        .insert(fragrances)
        .values({ name: `E2E FK Fragrance ${suffix}`, brand: 'E2E Brand' })
        .returning();

      const [listing] = await db
        .insert(listings)
        .values({
          fragranceId: fragrance.id,
          vendorId: referenced.id,
          sizeMl: 100,
          price: 50000,
          url: 'https://vendor-x.example.com/products/fk-100ml',
        })
        .returning();

      try {
        const res = await request(app.getHttpServer())
          .delete('/vendors/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ids: [referenced.id, unreferenced.id] })
          .expect(200);

        expect(res.body.results).toHaveLength(2);
        expect(res.body.results[0]).toEqual({
          id: referenced.id,
          success: false,
          error: 'Vendor is referenced by existing listings',
        });
        expect(res.body.results[1]).toEqual({
          id: unreferenced.id,
          success: true,
        });
        // unreferenced is already deleted; referenced.id stays tracked so
        // the top-level afterEach still cleans it up (its own delete was
        // refused, so the row is still there).
        createdVendorIds.splice(createdVendorIds.indexOf(unreferenced.id), 1);

        // The referenced vendor must still exist — the delete must have
        // been refused, not silently cascaded.
        await request(app.getHttpServer())
          .get(`/vendors/${referenced.id}`)
          .expect(200);
      } finally {
        await db.delete(listings).where(inArray(listings.id, [listing.id]));
        await db
          .delete(fragrances)
          .where(inArray(fragrances.id, [fragrance.id]));
      }
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      const created = await insertVendor();

      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .send({ ids: [created.id] })
        .expect(401);

      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ids: [created.id] })
        .expect(403);
    });
  });
});
