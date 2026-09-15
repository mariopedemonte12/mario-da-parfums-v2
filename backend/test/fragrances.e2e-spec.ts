import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ilike, inArray } from 'drizzle-orm';
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

// Runs the fragrances module against a real Postgres (docker-compose.yml —
// container must already be up) instead of a mocked db, per the testing
// skill's scope gate: the unique-name constraint, the PATCH/DELETE
// per-item DB error handling, the listings cascade-delete FK, and
// server-side filtering/pagination only surface for real against an
// actual database — mocked service specs (fragrances.service.spec.ts)
// can't exercise them. Defaults let this run without a committed .env;
// override via real env vars for CI/other setups.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { fragrances } = await import(
  '../src/database/schema/fragrance.schema.js'
);
const { listings } = await import('../src/database/schema/listing.schema.js');
const { vendors } = await import('../src/database/schema/vendor.schema.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

describe('Fragrances (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let db: any;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;

  const suffix = randomUUID().slice(0, 8);
  let nameCounter = 0;

  // Every fragrance created anywhere in this file embeds `suffix` in its
  // name, so afterEach can sweep them all with a single ilike delete
  // instead of tracking ids per test (tests create fragrances through the
  // API, not just via fixtures, so id-tracking would be scattered).
  function uniqueName(label: string) {
    nameCounter += 1;
    return `E2E ${label} ${suffix} ${nameCounter}`;
  }

  function validCreateItem(overrides: Record<string, unknown> = {}) {
    return {
      name: uniqueName('Fragrance'),
      brand: 'E2E Brand',
      ...overrides,
    };
  }

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
  });

  afterEach(async () => {
    // Cascade (fragrances -> listings, onDelete: 'cascade') takes any
    // fixture listings created against these fragrances with it.
    await db.delete(fragrances).where(ilike(fragrances.name, `%${suffix}%`));
  });

  afterAll(async () => {
    await app.close();
  });

  async function createViaApi(items: Record<string, unknown>[]) {
    const res = await request(app.getHttpServer())
      .post('/fragrances/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items })
      .expect(201);
    return res.body as { success: boolean; id?: string; error?: string }[];
  }

  // ---------------------------------------------------------------------
  // GET /fragrances/:id
  // ---------------------------------------------------------------------
  describe('GET /fragrances/:id', () => {
    // Spec (amended, "Alcance del CRUD"): GET /fragrances/:id is completely
    // public — no JwtAuthGuard/RolesGuard. Verified here against the real
    // guard stack (no Authorization header at all, and a non-admin token),
    // not just the absence of guard metadata on the handler.
    it('is public: returns 200 with no token and with a non-admin token', async () => {
      const [created] = await createViaApi([validCreateItem()]);

      await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('returns the real row for an admin, shaped per ResponseFragranceDto', async () => {
      const [created] = await createViaApi([
        validCreateItem({
          brand: 'Chanel',
          concentration: 'Eau de Parfum',
          description: 'A woody aromatic fragrance',
          imageUrl: 'https://example.com/images/bleu.jpg',
        }),
      ]);

      const res = await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: created.id,
        brand: 'Chanel',
        concentration: 'Eau de Parfum',
        description: 'A woody aromatic fragrance',
        imageUrl: 'https://example.com/images/bleu.jpg',
      });
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      // ResponseFragranceDto uses excludeExtraneousValues: the removed
      // s3KeyImage column must never leak even if present on the row.
      expect(res.body).not.toHaveProperty('s3KeyImage');
      expect(res.body).not.toHaveProperty('s3_key_image');
    });

    // BVA on the two independent conditions ParseUUIDPipe + row existence
    // cross: well-formed-but-absent -> 404 (service NotFoundException);
    // malformed -> 400 (ParseUUIDPipe, before the service even runs).
    it('returns 404 for a well-formed uuid that does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/fragrances/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 400 for a malformed id (not a uuid at all)', async () => {
      await request(app.getHttpServer())
        .get('/fragrances/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns the row matching :id specifically, not just any row', async () => {
      const [first, second] = await createViaApi([
        validCreateItem({ brand: 'Brand One' }),
        validCreateItem({ brand: 'Brand Two' }),
      ]);

      const res = await request(app.getHttpServer())
        .get(`/fragrances/${second.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(second.id);
      expect(res.body.id).not.toBe(first.id);
      expect(res.body.brand).toBe('Brand Two');
    });
  });

  // ---------------------------------------------------------------------
  // GET /fragrances — filters + pagination against real rows
  // ---------------------------------------------------------------------
  describe('GET /fragrances — public, filters, pagination', () => {
    // Spec (amended, "Alcance del CRUD"): GET /fragrances is completely
    // public — no JwtAuthGuard/RolesGuard. Verified against the real guard
    // stack, not just guard metadata.
    it('is public: returns 200 with no token and with a non-admin token', async () => {
      await request(app.getHttpServer()).get('/fragrances').expect(200);
      await request(app.getHttpServer())
        .get('/fragrances')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    describe('filters and pagination', () => {
      const brandX = `E2E Brand X ${suffix}`;
      const brandY = `E2E Brand Y ${suffix}`;

      beforeEach(async () => {
        // Deliberately mixed fixture: two brands, two concentrations, and a
        // shared name substring, so name/brand/concentration filters (and
        // their combination) each have matching and non-matching rows to
        // discriminate against.
        // The search keyword sits immediately next to `suffix` (one
        // contiguous token) so a "contains" filter on it stays scoped to
        // this test's own fixtures without also matching unrelated rows.
        await createViaApi([
          validCreateItem({
            name: `Aventus${suffix} Cologne ${++nameCounter}`,
            brand: brandX,
            concentration: 'EDP',
          }),
          validCreateItem({
            name: `Aventus${suffix} Parfum ${++nameCounter}`,
            brand: brandX,
            concentration: 'EDT',
          }),
          validCreateItem({
            name: `Sauvage${suffix} Elixir ${++nameCounter}`,
            brand: brandY,
            concentration: 'EDP',
          }),
        ]);
      });

      it('filters by name (partial, case-insensitive contains)', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ name: `aventus${suffix}`.toUpperCase(), limit: 100 })
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(
          res.body.data.every((f: any) =>
            f.name.toLowerCase().includes('aventus'),
          ),
        ).toBe(true);
      });

      it('filters by brand (exact match)', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 100 })
          .expect(200);

        expect(res.body.data.length).toBe(2);
        expect(res.body.data.every((f: any) => f.brand === brandX)).toBe(
          true,
        );
      });

      it('filters by concentration (exact match)', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, concentration: 'EDT', limit: 100 })
          .expect(200);

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].concentration).toBe('EDT');
      });

      it('combines name + brand + concentration all at once', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({
            name: `aventus${suffix}`,
            brand: brandX,
            concentration: 'EDP',
            limit: 100,
          })
          .expect(200);

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].concentration).toBe('EDP');
        expect(res.body.data[0].brand).toBe(brandX);
      });

      // specs/query-performance.md section 3: cursor pagination replaces
      // page/total for fragrances. nextCursor is set exactly when the page
      // comes back with `limit` rows (regardless of whether a further page
      // would actually have data) and null exactly when it comes back
      // shorter — these two cases are the two sides of that boundary.
      it('nextCursor is set when the page is exactly full (limit === filtered count)', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 2 })
          .expect(200);

        expect(res.body.data).toHaveLength(2);
        expect(res.body.nextCursor).toBe(res.body.data[1].id);
        expect(res.body).not.toHaveProperty('total');
        expect(res.body).not.toHaveProperty('page');
      });

      it('nextCursor is null when the page comes back shorter than limit', async () => {
        const res = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 100 })
          .expect(200);

        expect(res.body.data).toHaveLength(2);
        expect(res.body.nextCursor).toBeNull();
      });

      it('following nextCursor advances to the next page with no duplicate or skipped rows, then terminates', async () => {
        const page1 = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 1 })
          .expect(200);
        expect(page1.body.data).toHaveLength(1);
        expect(page1.body.nextCursor).toBe(page1.body.data[0].id);

        const page2 = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 1, cursor: page1.body.nextCursor })
          .expect(200);
        expect(page2.body.data).toHaveLength(1);
        expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);

        // brandX only has 2 matching rows total, but page2 still came back
        // exactly `limit` long, so per the documented rule nextCursor is
        // still set here (not a lookahead check) — following it one more
        // time is what actually reveals the end.
        const page3 = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 1, cursor: page2.body.nextCursor })
          .expect(200);
        expect(page3.body.data).toEqual([]);
        expect(page3.body.nextCursor).toBeNull();
      });

      it('the cursor condition composes with existing filters via AND (page 2 still respects the brand filter)', async () => {
        // brandY has one matching row that would appear right after brandX's
        // two if the cursor condition ignored the brand filter.
        const page1 = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 1 })
          .expect(200);

        const page2 = await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ brand: brandX, limit: 10, cursor: page1.body.nextCursor })
          .expect(200);

        expect(
          page2.body.data.every((f: any) => f.brand === brandX),
        ).toBe(true);
      });

      it('paginating without any filter enumerates every row exactly once (no gaps, no duplicates)', async () => {
        let cursor: string | undefined;
        const seen: string[] = [];
        for (let i = 0; i < 10; i++) {
          const res = await request(app.getHttpServer())
            .get('/fragrances')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ name: `aventus${suffix}`, limit: 1, ...(cursor ? { cursor } : {}) })
            .expect(200);
          seen.push(...res.body.data.map((f: any) => f.id));
          cursor = res.body.nextCursor ?? undefined;
          if (!res.body.nextCursor) break;
        }
        expect(new Set(seen).size).toBe(seen.length);
        expect(seen).toHaveLength(2);
      });

      // Cursor edge cases (specs/query-performance.md section 3). Nested
      // here (not a sibling describe) so brandX/the fixture rows from this
      // block's beforeEach stay in scope.
      describe('cursor validation and edge cases', () => {
        it('rejects a non-uuid cursor with 400', async () => {
          await request(app.getHttpServer())
            .get('/fragrances')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ cursor: 'not-a-uuid' })
            .expect(400);
        });

        it("a well-formed but non-existent cursor id does not error (gt() doesn't require existence)", async () => {
          await request(app.getHttpServer())
            .get('/fragrances')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ brand: brandX, cursor: randomUUID(), limit: 10 })
            .expect(200);
        });

        it('the cursor of the last real item returns an empty page with nextCursor: null', async () => {
          const full = await request(app.getHttpServer())
            .get('/fragrances')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ brand: brandX, limit: 100 })
            .expect(200);
          const lastId = full.body.data[full.body.data.length - 1].id;

          const res = await request(app.getHttpServer())
            .get('/fragrances')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ brand: brandX, cursor: lastId, limit: 100 })
            .expect(200);

          expect(res.body.data).toEqual([]);
          expect(res.body.nextCursor).toBeNull();
        });
      });
    });

    // BVA (two-point) on FindFragranceDto's limit: @Min(1) and @Max(100).
    describe('limit boundaries', () => {
      it('limit=1 (valid boundary) is accepted', async () => {
        await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ limit: 1 })
          .expect(200);
      });

      it('limit=0 (invalid neighbor) is rejected with 400', async () => {
        await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ limit: 0 })
          .expect(400);
      });

      it('limit=100 (valid boundary, MAX_LIMIT) is accepted', async () => {
        await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ limit: 100 })
          .expect(200);
      });

      it('limit=101 (invalid neighbor, over MAX_LIMIT) is rejected with 400', async () => {
        await request(app.getHttpServer())
          .get('/fragrances')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ limit: 101 })
          .expect(400);
      });
    });
  });

  // ---------------------------------------------------------------------
  // POST /fragrances/batch
  // ---------------------------------------------------------------------
  describe('POST /fragrances/batch', () => {
    it('creates a fragrance as admin and it becomes visible via GET /fragrances/:id', async () => {
      const [result] = await createViaApi([validCreateItem()]);
      expect(result.success).toBe(true);
      expect(result.id).toBeTruthy();

      await request(app.getHttpServer())
        .get(`/fragrances/${result.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    // BVA on items[] length: ArrayNotEmpty makes 0 the invalid boundary,
    // 1 its valid neighbor. No ArrayMaxSize exists in
    // CreateFragranceBatchDto, so the spec defines no upper bound — the
    // max/max+1 boundary from the testing skill is intentionally not
    // applicable here (noted per the skill's instruction to say so
    // explicitly rather than silently under-covering).
    it('rejects an empty items array end to end (400)', async () => {
      await request(app.getHttpServer())
        .post('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [] })
        .expect(400);
    });

    it('reports a real duplicate name as a per-item failure without aborting the batch', async () => {
      const name = uniqueName('Duplicate');
      await createViaApi([{ name, brand: 'E2E Brand' }]);

      const res = await request(app.getHttpServer())
        .post('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [validCreateItem(), { name, brand: 'E2E Brand' }],
        })
        .expect(201);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].success).toBe(true);
      expect(res.body[1].success).toBe(false);
      // fragrances.service.ts's isUniqueViolation() used to check
      // `(error as {code}).code === '23505'` directly on the caught error,
      // which this drizzle-orm version (0.45.x) never satisfies for a real
      // driver error (wrapped in a DrizzleQueryError whose `.code` lives on
      // `err.cause.code`, not `err.code`) — same defect
      // listings.e2e-spec.ts documents for listings.service.ts /
      // vendors.service.ts. Fixed in fragrances.service.ts to also check
      // `error.cause?.code`; this asserts the spec-documented message is
      // now actually reachable.
      expect(res.body[1].error).toBe(
        `Fragrance "${name}" already exists`,
      );
    });

    // BVA (two-point) on the @MaxLen guards added to CreateFragranceDto so
    // that name/brand/concentration/imageUrl can never overflow their DB
    // varchar columns (255/128/128/500) — previously these had no DTO-level
    // length check at all, so an oversized value reached Postgres and came
    // back as an opaque per-item write failure instead of a 400. Boundaries
    // are exercised end to end (not just via validate()) because the
    // consequence of getting them wrong is a real, indistinguishable DB
    // error, which only surfaces against a real Postgres write.
    describe('field length boundaries (DTO guards mirror DB varchar limits)', () => {
      it('accepts a brand at exactly 128 chars (valid boundary)', async () => {
        const [result] = await createViaApi([
          validCreateItem({ brand: 'X'.repeat(128) }),
        ]);
        expect(result.success).toBe(true);
      });

      it('rejects a brand at 129 chars (invalid neighbor) with 400, aborting the whole batch', async () => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            items: [
              validCreateItem({ brand: 'X'.repeat(129) }),
              validCreateItem(),
            ],
          })
          .expect(400);
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'items.0.brand' }),
          ]),
        );
      });

      it('accepts a name at exactly 255 chars (valid boundary)', async () => {
        // Keep the required suffix for cleanup while padding out to 255.
        const name = uniqueName('N').padEnd(255, 'x').slice(0, 255);
        const [result] = await createViaApi([{ name, brand: 'E2E Brand' }]);
        expect(result.success).toBe(true);
      });

      it('rejects a name at 256 chars (invalid neighbor) with 400', async () => {
        const name = uniqueName('N').padEnd(256, 'x').slice(0, 256);
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ name, brand: 'E2E Brand' }] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.name');
      });

      it('accepts a concentration at exactly 128 chars (valid boundary)', async () => {
        const [result] = await createViaApi([
          validCreateItem({ concentration: 'X'.repeat(128) }),
        ]);
        expect(result.success).toBe(true);
      });

      it('rejects a concentration at 129 chars (invalid neighbor) with 400', async () => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            items: [validCreateItem({ concentration: 'X'.repeat(129) })],
          })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.concentration');
      });

      it('accepts an imageUrl at exactly 500 chars (valid boundary)', async () => {
        const padding = 'a'.repeat(500 - 'https://example.com/.jpg'.length);
        const imageUrl = `https://example.com/${padding}.jpg`;
        expect(imageUrl).toHaveLength(500);
        const [result] = await createViaApi([validCreateItem({ imageUrl })]);
        expect(result.success).toBe(true);
      });

      it('rejects an imageUrl at 501 chars (invalid neighbor) with 400', async () => {
        const padding = 'a'.repeat(501 - 'https://example.com/.jpg'.length);
        const imageUrl = `https://example.com/${padding}.jpg`;
        expect(imageUrl).toHaveLength(501);
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [validCreateItem({ imageUrl })] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.imageUrl');
      });
    });

    // Decision table: DTO-shape violations run inside the global
    // ValidationPipe (ValidateNested over items[]) *before* the controller
    // ever calls the service — so unlike a DB/business error (duplicate
    // name, above), one item with a shape violation fails the whole
    // request with 400, it does not degrade to a per-item result. This is
    // a between-components behavior (pipe + nested DTO + controller) that
    // only an e2e test through the real HTTP pipeline demonstrates.
    it('rejects the whole batch with 400 when one item has an invalid field, even if other items are valid', async () => {
      const res = await request(app.getHttpServer())
        .post('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [validCreateItem(), { name: '', brand: 'E2E Brand' }],
        })
        .expect(400);

      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'items.1.name' }),
        ]),
      );

      // Confirm nothing was actually written for either item.
      const rows = await db
        .select()
        .from(fragrances)
        .where(ilike(fragrances.name, `%${suffix}%`));
      expect(rows).toHaveLength(0);
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      await request(app.getHttpServer())
        .post('/fragrances/batch')
        .send({ items: [validCreateItem()] })
        .expect(401);

      await request(app.getHttpServer())
        .post('/fragrances/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [validCreateItem()] })
        .expect(403);
    });

    // BVA (two-point) on required fields: IsNotEmpty makes '' the invalid
    // boundary and a single non-empty char its valid neighbor; IsString
    // makes a non-string value (123) invalid regardless of emptiness.
    describe('name / brand required-field boundaries', () => {
      it('rejects an empty-string name', async () => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ name: '', brand: 'E2E Brand' }] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.name');
      });

      it('accepts a 1-character name (valid neighbor)', async () => {
        const [result] = await createViaApi([
          { name: uniqueName('A'), brand: 'E2E Brand' },
        ]);
        expect(result.success).toBe(true);
      });

      it('rejects a non-string name', async () => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ name: 123, brand: 'E2E Brand' }] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.name');
      });

      it('rejects a missing brand', async () => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [{ name: uniqueName('NoBrand') }] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.brand');
      });
    });

    // Decision table for imageUrl (IsImageUrl validator): crossing
    // [parseable URL] x [http(s) protocol] x [allowed image extension in
    // pathname, before any query/fragment].
    describe('imageUrl validation — decision table', () => {
      const accepted = [
        'https://example.com/img.jpg',
        'https://example.com/img.jpeg',
        'https://example.com/img.png',
        'https://example.com/img.webp',
        'https://example.com/img.gif',
        'https://example.com/img.avif',
        'http://example.com/img.jpg', // http (not just https) is allowed
        'https://example.com/IMG.JPG', // extension match is case-insensitive
        'https://example.com/path/img.jpg?w=100&h=100', // query string after extension
        'https://example.com/img.jpg#preview', // fragment after extension
      ];

      it.each(accepted)('accepts %s', async (imageUrl) => {
        const [result] = await createViaApi([
          validCreateItem({ imageUrl }),
        ]);
        expect(result.success).toBe(true);
      });

      const rejected: [string, string][] = [
        ['not-a-url', 'not parseable as a URL at all'],
        ['ftp://example.com/img.jpg', 'non-http(s) protocol'],
        ['https://example.com/img.txt', 'disallowed extension'],
        ['https://example.com/img', 'no extension at all'],
        ['https://example.com/img.jpg.txt', 'extension not at the end'],
        [
          'https://example.com/image?file=photo.jpg',
          'extension only in the query string, not the path',
        ],
      ];

      it.each(rejected)('rejects %s (%s)', async (imageUrl) => {
        const res = await request(app.getHttpServer())
          .post('/fragrances/batch')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ items: [validCreateItem({ imageUrl })] })
          .expect(400);
        expect(res.body.errors[0].field).toBe('items.0.imageUrl');
      });

      it('accepts a missing imageUrl (optional field)', async () => {
        const [result] = await createViaApi([validCreateItem()]);
        expect(result.success).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------
  // PATCH /fragrances/batch
  // ---------------------------------------------------------------------
  describe('PATCH /fragrances/batch', () => {
    it('updates fields and bumps updatedAt', async () => {
      const [created] = await createViaApi([
        validCreateItem({ brand: 'Old Brand' }),
      ]);
      const before = await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const originalUpdatedAt = new Date(before.body.updatedAt).getTime();

      await new Promise((r) => setTimeout(r, 5));

      const res = await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: created.id, brand: 'New Brand' }] })
        .expect(200);

      expect(res.body[0]).toEqual({ id: created.id, success: true });

      const after = await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.brand).toBe('New Brand');
      expect(new Date(after.body.updatedAt).getTime()).toBeGreaterThan(
        originalUpdatedAt,
      );
    });

    it('reports an unknown id as a per-item not-found without aborting the batch', async () => {
      const [created] = await createViaApi([validCreateItem()]);
      const unknownId = randomUUID();

      const res = await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { id: created.id, brand: 'Updated Brand' },
            { id: unknownId, brand: 'Whatever' },
          ],
        })
        .expect(200);

      expect(res.body).toEqual([
        { id: created.id, success: true },
        { id: unknownId, success: false, error: 'Fragrance not found' },
      ]);
    });

    it('reports moving to an existing name as a per-item conflict, not a 409, without aborting the batch', async () => {
      const [existing, toUpdate] = await createViaApi([
        validCreateItem(),
        validCreateItem(),
      ]);

      const res = await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { id: toUpdate.id, name: (await getName(existing.id!)) },
          ],
        })
        .expect(200);

      expect(res.body[0].id).toBe(toUpdate.id);
      expect(res.body[0].success).toBe(false);
      expect(res.body[0].error).toMatch(/already exists/i);
    });

    it('rejects the whole batch with 400 when one item has an invalid field, even if other items are valid', async () => {
      const [created] = await createViaApi([validCreateItem()]);

      const res = await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { id: created.id, brand: 'Fine' },
            { id: created.id, imageUrl: 'not-a-url' },
          ],
        })
        .expect(400);

      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'items.1.imageUrl' }),
        ]),
      );
    });

    // Decision table: id well-formed/malformed crossed with body valid/
    // invalid (mirrors update-fragrance-batch.dto.spec.ts's unit coverage,
    // confirmed here end to end through the real validation pipe + guard
    // stack rather than validate() directly).
    it('rejects a non-uuid id in a batch item with 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [{ id: 'not-a-uuid', brand: 'X' }] })
        .expect(400);
      expect(res.body.errors[0].field).toBe('items.0.id');
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      const [created] = await createViaApi([validCreateItem()]);

      await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .send({ items: [{ id: created.id, brand: 'X' }] })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/fragrances/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ items: [{ id: created.id, brand: 'X' }] })
        .expect(403);
    });

    async function getName(id: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .get(`/fragrances/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return res.body.name;
    }
  });

  // ---------------------------------------------------------------------
  // DELETE /fragrances/batch
  // ---------------------------------------------------------------------
  describe('DELETE /fragrances/batch', () => {
    it('deletes an existing fragrance and reports an unknown id in the same batch as not-found', async () => {
      const [created] = await createViaApi([validCreateItem()]);
      const unknownId = randomUUID();

      const res = await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [created.id, unknownId] })
        .expect(200);

      expect(res.body).toEqual([
        { id: created.id, success: true },
        { id: unknownId, success: false, error: 'Fragrance not found' },
      ]);

      await request(app.getHttpServer())
        .get(`/fragrances/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('cascades to listings referencing the deleted fragrance (onDelete: cascade)', async () => {
      const [created] = await createViaApi([validCreateItem()]);
      const [vendor] = await db
        .insert(vendors)
        .values({
          name: `E2E Vendor ${suffix}`,
          websiteUrl: 'https://vendor.example.com',
        })
        .returning();

      const [listing] = await db
        .insert(listings)
        .values({
          fragranceId: created.id,
          vendorId: vendor.id,
          sizeMl: 100,
          price: 50000,
          url: 'https://vendor.example.com/x',
        })
        .returning();

      await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [created.id] })
        .expect(200);

      const remaining = await db
        .select()
        .from(listings)
        .where(inArray(listings.id, [listing.id]));
      expect(remaining).toHaveLength(0);

      await db.delete(vendors).where(inArray(vendors.id, [vendor.id]));
    });

    // Concurrency: removeMany() fires one DELETE per id via Promise.all,
    // all racing against the same row. Deleting the same real id twice in
    // one batch is a between-components case a unit test (which would
    // mock the db call and never model the race) can't exercise: exactly
    // one of the two should win (`success: true`), the other should see
    // the row already gone (`success: false, Fragrance not found`) — not
    // both succeeding, and not both failing.
    it('deleting the same id twice in one batch: exactly one succeeds, the other reports not-found', async () => {
      const [created] = await createViaApi([validCreateItem()]);

      const res = await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [created.id, created.id] })
        .expect(200);

      const successes = res.body.filter((r: any) => r.success);
      const failures = res.body.filter((r: any) => !r.success);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        id: created.id,
        success: false,
        error: 'Fragrance not found',
      });
    });

    it('rejects an empty ids array end to end (400)', async () => {
      await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] })
        .expect(400);
    });

    it('rejects without a token (401) and rejects a non-admin token (403)', async () => {
      const [created] = await createViaApi([validCreateItem()]);

      await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .send({ ids: [created.id] })
        .expect(401);

      await request(app.getHttpServer())
        .delete('/fragrances/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ids: [created.id] })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------
  // Decision table: role x endpoint (all 5 endpoints from
  // specs/fragrances-crud.md's "Alcance del CRUD")
  // ---------------------------------------------------------------------
  // Full combinatorial coverage (3 roles x 5 endpoints = 15 cells) per the
  // testing skill's "<=4 conditions -> full coverage" rule (role and
  // endpoint are the two independent conditions here). Guard order for the
  // batch endpoints is JwtAuthGuard then RolesGuard, so "no token" always
  // yields 401 and "wrong role" always yields 403 there, before the
  // service/DB ever runs. The two GET endpoints carry no guards at all
  // (per the amended spec), so every role — including no token — reaches
  // the service and gets the same success status.
  describe('role x endpoint decision table', () => {
    let target: { id: string };

    beforeEach(async () => {
      [target] = await createViaApi([validCreateItem()]);
    });

    const operations = [
      {
        name: 'list',
        run: (token: string | null) =>
          request(app.getHttpServer())
            .get('/fragrances')
            .set(...authHeader(token)),
        successStatus: 200,
        public: true,
      },
      {
        name: 'getById',
        run: (token: string | null) =>
          request(app.getHttpServer())
            .get(`/fragrances/${target.id}`)
            .set(...authHeader(token)),
        successStatus: 200,
        public: true,
      },
      {
        name: 'create',
        run: (token: string | null) =>
          request(app.getHttpServer())
            .post('/fragrances/batch')
            .set(...authHeader(token))
            .send({ items: [validCreateItemForTable()] }),
        successStatus: 201,
        public: false,
      },
      {
        name: 'update',
        run: (token: string | null) =>
          request(app.getHttpServer())
            .patch('/fragrances/batch')
            .set(...authHeader(token))
            .send({ items: [{ id: target.id, brand: 'Updated' }] }),
        successStatus: 200,
        public: false,
      },
      {
        name: 'delete',
        run: (token: string | null) =>
          request(app.getHttpServer())
            .delete('/fragrances/batch')
            .set(...authHeader(token))
            .send({ ids: [target.id] }),
        successStatus: 200,
        public: false,
      },
    ];

    function authHeader(token: string | null): [string, string] {
      return token
        ? ['Authorization', `Bearer ${token}`]
        : ['X-No-Auth', 'true'];
    }

    function validCreateItemForTable() {
      return validCreateItem();
    }

    const roles: [string, () => string | null, number][] = [
      ['no token', () => null, 401],
      ['user role', () => userToken, 403],
      ['admin role', () => adminToken, 0 /* filled per-op below */],
    ];

    for (const op of operations) {
      for (const [roleLabel, getToken, fixedStatus] of roles) {
        const expected =
          op.public || roleLabel === 'admin role' ? op.successStatus : fixedStatus;
        it(`${op.name} as ${roleLabel} -> ${expected}`, async () => {
          await op.run(getToken()).expect(expected);
        });
      }
    }
  });
});
