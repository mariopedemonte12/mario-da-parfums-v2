import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, inArray } from 'drizzle-orm';
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

// Runs the favorites module against a real Postgres (docker-compose.yml —
// container must already be up) instead of a mocked db, per the testing
// skill's scope gate: the (userId, fragranceId) unique constraint and the
// ownership scoping (a delete/list only ever touching the caller's own
// rows) only surface for real against an actual database — a mocked
// service (as in favorites.service.spec.ts) can't exercise them. Defaults
// let this run without a committed .env; override via real env vars for
// CI/other setups.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { favorites } = await import('../src/database/schema/favorite.schema.js');
const { fragrances } =
  await import('../src/database/schema/fragrance.schema.js');
const { users } = await import('../src/database/schema/user.schema.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

describe('Favorites (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let db: any;
  let jwtService: JwtService;
  let userAToken: string;
  let adminToken: string;

  let userA: { id: number };
  let userB: { id: number };
  let admin: { id: number };
  let fragranceA: { id: string };
  let fragranceB: { id: string };
  let fragranceC: { id: string };

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

    // Real user rows: favorites.userId FKs onto users.id (not null), so a
    // JWT signed with an arbitrary `sub` that doesn't exist as a row would
    // fail every insert on the FK, not on the rule under test.
    [userA] = await db
      .insert(users)
      .values({
        name: `E2E Favorites User A ${suffix}`,
        email: `favorites-user-a-${suffix}@example.com`,
        role: Role.USER,
        passwordHash: 'irrelevant-for-e2e',
      })
      .returning();
    [userB] = await db
      .insert(users)
      .values({
        name: `E2E Favorites User B ${suffix}`,
        email: `favorites-user-b-${suffix}@example.com`,
        role: Role.USER,
        passwordHash: 'irrelevant-for-e2e',
      })
      .returning();
    [admin] = await db
      .insert(users)
      .values({
        name: `E2E Favorites Admin ${suffix}`,
        email: `favorites-admin-${suffix}@example.com`,
        role: Role.ADMIN,
        passwordHash: 'irrelevant-for-e2e',
      })
      .returning();

    userAToken = jwtService.sign({
      sub: userA.id,
      email: userA.email,
      role: Role.USER,
    });
    adminToken = jwtService.sign({
      sub: admin.id,
      email: admin.email,
      role: Role.ADMIN,
    });

    [fragranceA] = await db
      .insert(fragrances)
      .values({
        name: `E2E Favorites Fragrance A ${suffix}`,
        brand: 'E2E Brand',
      })
      .returning();
    [fragranceB] = await db
      .insert(fragrances)
      .values({
        name: `E2E Favorites Fragrance B ${suffix}`,
        brand: 'E2E Brand',
      })
      .returning();
    [fragranceC] = await db
      .insert(fragrances)
      .values({
        name: `E2E Favorites Fragrance C ${suffix}`,
        brand: 'E2E Brand',
      })
      .returning();
  });

  afterEach(async () => {
    // Every test seeds/mutates favorites rows scoped to the three fixture
    // users; wipe them after each test so one test's rows never leak into
    // the next (fragrances/users are fixed fixtures, cleaned only in
    // afterAll).
    await db
      .delete(favorites)
      .where(inArray(favorites.userId, [userA.id, userB.id, admin.id]));
  });

  afterAll(async () => {
    await db
      .delete(fragrances)
      .where(
        inArray(fragrances.id, [fragranceA.id, fragranceB.id, fragranceC.id]),
      );
    await db
      .delete(users)
      .where(inArray(users.id, [userA.id, userB.id, admin.id]));
    await app.close();
  });

  async function seedFavorite(userId: number, fragranceId: string) {
    const [row] = await db
      .insert(favorites)
      .values({ userId, fragranceId })
      .returning();
    return row;
  }

  describe('Auth — every route requires a valid JWT, no role restriction', () => {
    it('rejects every route without a token (401)', async () => {
      await request(app.getHttpServer()).get('/favorites').expect(401);
      await request(app.getHttpServer())
        .get(`/favorites/fragrances/${fragranceA.id}/count`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/favorites/batch')
        .send({ fragranceIds: [fragranceA.id] })
        .expect(401);
      await request(app.getHttpServer())
        .delete('/favorites/batch')
        .send({ fragranceIds: [fragranceA.id] })
        .expect(401);
    });

    it('accepts an ADMIN token on every route exactly like a USER token (no @Roles restriction)', async () => {
      // Per specs/favorite-module.md "Auth": an ADMIN favorites fragrances
      // the same way a USER does — no RolesGuard on any favorites route.
      const createRes = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(201);
      expect(createRes.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });

      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deleteRes = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(200);
      expect(deleteRes.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });
    });
  });

  describe('GET /favorites/fragrances/:fragranceId/count — popularity, global not per-user', () => {
    it('returns 0 for a fragrance nobody has favorited', async () => {
      const res = await request(app.getHttpServer())
        .get(`/favorites/fragrances/${fragranceB.id}/count`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body).toEqual({
        fragranceId: fragranceB.id,
        favoritesCount: 0,
      });
    });

    it('counts favorites across every user, not just the caller', async () => {
      await seedFavorite(userA.id, fragranceB.id);
      await seedFavorite(userB.id, fragranceB.id);

      const res = await request(app.getHttpServer())
        .get(`/favorites/fragrances/${fragranceB.id}/count`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({
        fragranceId: fragranceB.id,
        favoritesCount: 2,
      });
    });

    it('returns 400 for a malformed (non-UUID) fragranceId', async () => {
      await request(app.getHttpServer())
        .get('/favorites/fragrances/not-a-uuid/count')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(400);
    });

    it('returns 404 for a well-formed but non-existent fragranceId', async () => {
      await request(app.getHttpServer())
        .get(`/favorites/fragrances/${randomUUID()}/count`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(404);
    });
  });

  describe('POST /favorites/batch — decision table: fragrance existence x already-favorited-by-caller', () => {
    it('marks a fragrance the caller has not favorited yet (success, real row created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(201);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });
      expect(typeof res.body[0].id).toBe('number');

      const [row] = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userA.id),
            eq(favorites.fragranceId, fragranceA.id),
          ),
        );
      expect(row).toBeDefined();
    });

    it('reports an unknown fragranceId as a per-item not-found without aborting the batch', async () => {
      const unknownId = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id, unknownId] })
        .expect(201);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });
      expect(res.body[1]).toMatchObject({
        fragranceId: unknownId,
        success: false,
      });
      expect(res.body[1].error).toBeTruthy();
    });

    it('reports a fragrance already favorited by the caller as a per-item conflict, not aborting the batch', async () => {
      await seedFavorite(userA.id, fragranceA.id);

      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id, fragranceB.id] })
        .expect(201);

      expect(res.body[1]).toMatchObject({
        fragranceId: fragranceB.id,
        success: true,
      });
      // FavoritesService.isUniqueViolation() unwraps both `error.code` and
      // `error.cause.code` (drizzle-orm 0.45.x wraps the real driver error
      // in a DrizzleQueryError whose `.code` lives on `.cause`), so the
      // real 23505 here is recognized and mapped to the spec-documented
      // per-item message instead of falling through to the generic catch.
      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: false,
      });
      expect(res.body[0].error).toBe('Fragrance already marked as favorite');

      // Real unique-constraint enforcement: exactly one row exists for
      // (userA, fragranceA) no matter how many times this batch is retried
      // — this only proves anything against a real Postgres index, a
      // mocked db can't fake a constraint violation on a duplicate insert.
      const rows = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userA.id),
            eq(favorites.fragranceId, fragranceA.id),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('marks the same fragranceId concurrently within one batch: first item wins, the duplicate fails against the real unique index', async () => {
      // Two entries for the same fragrance in a single request race each
      // other via Promise.all inside FavoritesService.createMany — this is
      // exactly the case the unique index (not app-level pre-checking) has
      // to resolve, and only a real Postgres constraint can prove it.
      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceC.id, fragranceC.id] })
        .expect(201);

      const successes = res.body.filter((r: any) => r.success);
      const failures = res.body.filter((r: any) => !r.success);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const rows = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userA.id),
            eq(favorites.fragranceId, fragranceC.id),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('lets a caller favorite a fragrance already favorited by a DIFFERENT user (unique index is scoped to (userId, fragranceId), not fragranceId alone)', async () => {
      await seedFavorite(userB.id, fragranceA.id);

      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(201);

      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });

      const rows = await db
        .select()
        .from(favorites)
        .where(eq(favorites.fragranceId, fragranceA.id));
      expect(rows).toHaveLength(2);
    });

    // BVA (two-point) on CreateFavoriteBatchDto.fragranceIds
    it('rejects an empty fragranceIds array (400, FRAGRANCE_IDS_REQUIRED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [] })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('FRAGRANCE_IDS_REQUIRED');
    });

    it('accepts a batch of exactly one id (the non-empty boundary)', async () => {
      await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(201);
    });

    it('rejects a malformed (non-UUID) id anywhere in the array (400, FRAGRANCE_ID_INVALID_FORMAT), whole request rejected before hitting the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id, 'not-a-uuid'] })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('FRAGRANCE_ID_INVALID_FORMAT');

      // Validation rejects the whole request, so even the valid id in the
      // same array must not have been inserted.
      const rows = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userA.id),
            eq(favorites.fragranceId, fragranceA.id),
          ),
        );
      expect(rows).toHaveLength(0);
    });
  });

  describe('DELETE /favorites/batch — decision table: ownership (row exists x belongs to caller)', () => {
    it('unmarks an existing favorite owned by the caller (success, row actually removed)', async () => {
      await seedFavorite(userA.id, fragranceA.id);

      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(200);

      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });

      const rows = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userA.id),
            eq(favorites.fragranceId, fragranceA.id),
          ),
        );
      expect(rows).toHaveLength(0);
    });

    it('reports not-found for a fragranceId the caller never favorited (no row exists at all)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(200);

      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: false,
      });
      expect(res.body[0].error).toBeTruthy();
    });

    it("reports not-found for a fragranceId favorited by a DIFFERENT user, and leaves that other user's favorite untouched (ownership boundary)", async () => {
      await seedFavorite(userB.id, fragranceA.id);

      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id] })
        .expect(200);

      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: false,
      });

      const rows = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userB.id),
            eq(favorites.fragranceId, fragranceA.id),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it('partial success: removes an owned favorite and reports the not-owned one as not-found in the same batch', async () => {
      await seedFavorite(userA.id, fragranceA.id);
      await seedFavorite(userB.id, fragranceB.id);

      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [fragranceA.id, fragranceB.id] })
        .expect(200);

      expect(res.body[0]).toMatchObject({
        fragranceId: fragranceA.id,
        success: true,
      });
      expect(res.body[1]).toMatchObject({
        fragranceId: fragranceB.id,
        success: false,
      });

      const bStillThere = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, userB.id),
            eq(favorites.fragranceId, fragranceB.id),
          ),
        );
      expect(bStillThere).toHaveLength(1);
    });

    // BVA (two-point) on DeleteFavoriteBatchDto.fragranceIds
    it('rejects an empty fragranceIds array (400, FRAGRANCE_IDS_REQUIRED)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: [] })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('FRAGRANCE_IDS_REQUIRED');
    });

    it('rejects a malformed (non-UUID) id in the array (400, FRAGRANCE_ID_INVALID_FORMAT)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fragranceIds: ['not-a-uuid'] })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('FRAGRANCE_ID_INVALID_FORMAT');
    });
  });

  describe('GET /favorites — list scoped to the caller, with embedded fragrance data', () => {
    it("returns only the caller's own favorites, embedding fragrance data, never another user's", async () => {
      await seedFavorite(userA.id, fragranceA.id);
      await seedFavorite(userB.id, fragranceB.id);

      const res = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        fragrance: { id: fragranceA.id, name: (fragranceA as any).name },
      });
      expect(res.body.data[0].fragrance.id).not.toBe(fragranceB.id);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('createdAt');
      // Out-of-scope confirmation (specs/favorite-module.md "Explicitly out
      // of scope"): the embedded fragrance carries catalog fields only, no
      // price/listing data joined in.
      expect(res.body.data[0].fragrance).not.toHaveProperty('price');
      expect(res.body.data[0].fragrance).not.toHaveProperty('listings');
    });

    it('returns an empty list with correct pagination metadata when the caller has no favorites', async () => {
      const res = await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    describe('pagination against real rows', () => {
      beforeEach(async () => {
        await seedFavorite(userA.id, fragranceA.id);
        await seedFavorite(userA.id, fragranceB.id);
        await seedFavorite(userA.id, fragranceC.id);
      });

      it('paginates: limit constrains page size, total reflects the full count, pages do not overlap', async () => {
        const page1 = await request(app.getHttpServer())
          .get('/favorites')
          .query({ page: 1, limit: 2 })
          .set('Authorization', `Bearer ${userAToken}`)
          .expect(200);
        const page2 = await request(app.getHttpServer())
          .get('/favorites')
          .query({ page: 2, limit: 2 })
          .set('Authorization', `Bearer ${userAToken}`)
          .expect(200);

        expect(page1.body.data).toHaveLength(2);
        expect(page1.body.total).toBe(3);
        expect(page2.body.data).toHaveLength(1);

        const idsPage1 = page1.body.data.map((f: any) => f.id);
        const idsPage2 = page2.body.data.map((f: any) => f.id);
        expect(idsPage1.some((id: number) => idsPage2.includes(id))).toBe(
          false,
        );
      });

      it('defaults to page=1, limit=20 when omitted', async () => {
        const res = await request(app.getHttpServer())
          .get('/favorites')
          .set('Authorization', `Bearer ${userAToken}`)
          .expect(200);

        expect(res.body.page).toBe(1);
        expect(res.body.limit).toBe(20);
        expect(res.body.data).toHaveLength(3);
      });
    });

    // BVA (two-point) on FindFavoritesDto.page/limit
    it('rejects page=0 (below the min:1 boundary) with 400', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .query({ page: 0 })
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(400);
    });

    it('accepts page=1 (the min boundary itself)', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .query({ page: 1 })
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
    });

    it('rejects limit=0 (below the min:1 boundary) with 400', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .query({ limit: 0 })
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(400);
    });

    it('accepts limit=100 (the max boundary itself)', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);
    });

    it('rejects limit=101 (above the max:100 boundary) with 400', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .query({ limit: 101 })
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(400);
    });
  });
});
