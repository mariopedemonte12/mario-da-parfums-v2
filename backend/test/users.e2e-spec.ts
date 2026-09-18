import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

// Runs the users module against a real Postgres (docker-compose.yml —
// container must already be up), per the testing skill's scope gate: the
// business rules that matter here (name/email UNIQUE constraints producing
// 409s, and the SelfOrAdmin vs Roles(ADMIN) access-control split across
// GET/PATCH/DELETE) only surface end-to-end through the real guard +
// controller + service + db chain — a mocked service can't exercise the
// guard composition or the real unique-constraint conflict. Defaults let
// this run without a committed .env; override via real env vars for CI.
process.env.DATABASE_URL ??=
  'postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums';
process.env.JWT_SECRET ??= 'local-test-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN ??= '15m';

const { AppModule } = await import('../src/app.module.js');
const { DRIZZLE } = await import('../src/database/database.module.js');
const { users } = await import('../src/database/schema/user.schema.js');
const { Role } = await import('../src/shared/enums/role.enums.js');

describe('Users (e2e, real Postgres)', () => {
  let app: INestApplication<App>;
  let db: any;
  let jwtService: JwtService;

  const suffix = randomUUID().slice(0, 8);
  const createdUserIds = new Set<number>();

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
  });

  afterAll(async () => {
    if (createdUserIds.size > 0) {
      await db.delete(users).where(inArray(users.id, [...createdUserIds]));
    }
    await app.close();
  });

  // Inserts directly against the db (not via an API the users module
  // deliberately doesn't expose — see specs/users-crud.md, "users no crea
  // cuentas"). passwordHash is an opaque placeholder: no test in this file
  // exercises login/password verification, only profile read/update/delete.
  async function createUser(overrides: Record<string, unknown> = {}) {
    const [row] = await db
      .insert(users)
      .values({
        name: `E2E User ${randomUUID().slice(0, 8)} ${suffix}`,
        email: `e2e-${randomUUID().slice(0, 8)}-${suffix}@example.com`,
        role: Role.USER,
        passwordHash: 'not-a-real-hash',
        ...overrides,
      })
      .returning();
    createdUserIds.add(row.id);
    return row as { id: number; name: string; email: string; role: string };
  }

  function tokenFor(user: { id: number; email: string; role: string }) {
    return jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  describe('GET /users/:id and PATCH /users/:id — SelfOrAdminGuard (decision table)', () => {
    // Conditions: authenticated? / isAdmin? / isOwner? — full combinatorial
    // coverage (≤ 3 independent conditions per the testing skill).
    let admin: Awaited<ReturnType<typeof createUser>>;
    let owner: Awaited<ReturnType<typeof createUser>>;
    let stranger: Awaited<ReturnType<typeof createUser>>;
    let adminToken: string;
    let ownerToken: string;
    let strangerToken: string;

    beforeAll(async () => {
      admin = await createUser({ role: Role.ADMIN });
      owner = await createUser();
      stranger = await createUser();
      adminToken = tokenFor(admin);
      ownerToken = tokenFor(owner);
      strangerToken = tokenFor(stranger);
    });

    it('GET /users/:id — no token => 401', async () => {
      await request(app.getHttpServer()).get(`/users/${owner.id}`).expect(401);
    });

    it('GET /users/:id — non-admin, not the owner => 403', async () => {
      await request(app.getHttpServer())
        .get(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('GET /users/:id — non-admin, is the owner => 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.id).toBe(owner.id);
    });

    it('GET /users/:id — admin, not the owner => 200 (admin bypasses ownership)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.id).toBe(owner.id);
    });

    it('GET /users/:id — admin requesting their own id => 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.id).toBe(admin.id);
    });

    it('GET /users/:id — non-existent id, authenticated as admin => 404', async () => {
      await request(app.getHttpServer())
        .get('/users/2147483647')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('response never includes passwordHash and matches the documented shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).toMatchObject({
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: Role.USER,
      });
      expect(res.body).toHaveProperty('createdAt');
    });

    it('PATCH /users/:id — no token => 401', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${owner.id}`)
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('PATCH /users/:id — non-admin, not the owner => 403, and the target is unchanged', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ name: 'Hijacked Name' })
        .expect(403);

      const check = await request(app.getHttpServer())
        .get(`/users/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(check.body.name).toBe(owner.name);
    });

    it("PATCH /users/:id — admin editing a different user's profile => 200", async () => {
      const target = await createUser();
      const res = await request(app.getHttpServer())
        .patch(`/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Admin Edited ${suffix}` })
        .expect(200);
      expect(res.body.name).toBe(`Admin Edited ${suffix}`);
    });
  });

  describe('GET /users — admin-only listing (Roles(ADMIN) decision table)', () => {
    let admin: Awaited<ReturnType<typeof createUser>>;
    let plainUser: Awaited<ReturnType<typeof createUser>>;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
      admin = await createUser({ role: Role.ADMIN });
      plainUser = await createUser();
      adminToken = tokenFor(admin);
      userToken = tokenFor(plainUser);
    });

    it('no token => 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('non-admin token => 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('admin token => 200 with data/meta shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
    });
  });

  describe('DELETE /users/:id — admin-only (Roles(ADMIN) decision table, self-delete out of scope)', () => {
    let admin: Awaited<ReturnType<typeof createUser>>;
    let adminToken: string;

    beforeAll(async () => {
      admin = await createUser({ role: Role.ADMIN });
      adminToken = tokenFor(admin);
    });

    it('no token => 401', async () => {
      const target = await createUser();
      await request(app.getHttpServer())
        .delete(`/users/${target.id}`)
        .expect(401);
    });

    it('non-admin token, deleting someone else => 403', async () => {
      const target = await createUser();
      const otherToken = tokenFor(await createUser());
      await request(app.getHttpServer())
        .delete(`/users/${target.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    // specs/users-crud.md, "Fuera de alcance": self-deletion is explicitly
    // not part of the contract — DELETE stays admin-only even against the
    // caller's own id.
    it('non-admin token, deleting own id (self-delete) => 403', async () => {
      const self = await createUser();
      const selfToken = tokenFor(self);
      await request(app.getHttpServer())
        .delete(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .expect(403);
    });

    it('admin token, existing id => 200 and the user becomes unreachable (404) afterwards', async () => {
      const target = await createUser();
      await request(app.getHttpServer())
        .delete(`/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      createdUserIds.delete(target.id);

      await request(app.getHttpServer())
        .get(`/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('admin token, non-existent id => 404', async () => {
      await request(app.getHttpServer())
        .delete('/users/2147483647')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/:id — UpdateUserDto validation (Boundary Value Analysis)', () => {
    let self: Awaited<ReturnType<typeof createUser>>;
    let selfToken: string;

    beforeEach(async () => {
      self = await createUser();
      selfToken = tokenFor(self);
    });

    it('name: wrong type (number) => 400', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ name: 12345 })
        .expect(400);
    });

    it('name: profane value => 400', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ name: 'shit' })
        .expect(400);
    });

    it('name: clean string value => 200 and persists', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ name: `Clean Name ${suffix}` })
        .expect(200);
      expect(res.body.name).toBe(`Clean Name ${suffix}`);
    });

    it('email: invalid format => 400', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('email: valid format => 200 and persists', async () => {
      const newEmail = `e2e-updated-${randomUUID().slice(0, 8)}-${suffix}@example.com`;
      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ email: newEmail })
        .expect(200);
      expect(res.body.email).toBe(newEmail);
    });

    // photoS3Key @MaxLen(255) boundary — two points: 255 (valid) / 256 (invalid).
    it('photoS3Key: length 255 (boundary) => 200', async () => {
      const key = 'a'.repeat(255);
      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ photoS3Key: key })
        .expect(200);
      expect(res.body.photoS3Key).toBe(key);
    });

    it('photoS3Key: length 256 (over boundary) => 400', async () => {
      const key = 'a'.repeat(256);
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ photoS3Key: key })
        .expect(400);
    });

    it('photoS3Key: charset outside the S3-key pattern (e.g. a space) => 400', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ photoS3Key: 'users/avatars/has space.jpg' })
        .expect(400);
    });

    it('photoS3Key: valid S3-key charset => 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ photoS3Key: "users/avatars/1_valid-key.'()!*.jpg" })
        .expect(200);
      expect(res.body.photoS3Key).toBe("users/avatars/1_valid-key.'()!*.jpg");
    });

    it('empty body (no fields) => 200, no-op', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({})
        .expect(200);
      expect(res.body).toMatchObject({ name: self.name, email: self.email });
    });

    // Uses adminToken, not selfToken: SelfOrAdminGuard runs before the
    // controller/service, and a non-admin token for an id that isn't their
    // own always short-circuits to 403 (see the SelfOrAdminGuard decision
    // table above) — so a self-user token can never reach the service's own
    // 404 check against an arbitrary non-existent id. Admin bypasses
    // ownership, isolating the service-level 404 behavior.
    it('non-existent id (admin) => 404', async () => {
      const admin = await createUser({ role: Role.ADMIN });
      await request(app.getHttpServer())
        .patch('/users/2147483647')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Whoever' })
        .expect(404);
    });

    it('duplicate email against another real user => 409', async () => {
      const other = await createUser();
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ email: other.email })
        .expect(409);
    });

    it('duplicate name against another real user => 409', async () => {
      const other = await createUser();
      await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ name: other.name })
        .expect(409);
    });
  });

  // specs/users-crud.md security decisions: role and password are excluded
  // from UpdateUserDto entirely, for both self and admin. customValidationPipe
  // uses `whitelist: true`, so unknown fields are silently stripped rather
  // than rejected — this block confirms the *effect* (role/password never
  // change), which is what the spec actually guarantees, independent of
  // whether the mechanism is strip-vs-reject.
  describe('PATCH /users/:id — role/password are never mutable via this endpoint', () => {
    it('self sending { role: "admin" } cannot self-promote', async () => {
      const self = await createUser({ role: Role.USER });
      const selfToken = tokenFor(self);

      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({
          role: Role.ADMIN,
          name: `Still User ${randomUUID().slice(0, 8)} ${suffix}`,
        });

      // Either the extra field is stripped (200, role unchanged) or rejected
      // outright (400) — both satisfy the spec's guarantee. What must never
      // happen is a 200 with role actually promoted.
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.role).toBe(Role.USER);
      }

      const check = await request(app.getHttpServer())
        .get(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .expect(200);
      expect(check.body.role).toBe(Role.USER);
    });

    it("admin sending { role: ... } on someone else's profile does not change their role", async () => {
      const admin = await createUser({ role: Role.ADMIN });
      const adminToken = tokenFor(admin);
      const target = await createUser({ role: Role.USER });

      const res = await request(app.getHttpServer())
        .patch(`/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: Role.ADMIN,
          name: `Still User ${randomUUID().slice(0, 8)} ${suffix}`,
        });

      expect([200, 400]).toContain(res.status);

      const check = await request(app.getHttpServer())
        .get(`/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(check.body.role).toBe(Role.USER);
    });

    it('sending { password: ... } does not change the stored credential (login-relevant behavior is untouched)', async () => {
      const self = await createUser();
      const selfToken = tokenFor(self);

      const res = await request(app.getHttpServer())
        .patch(`/users/${self.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ password: 'SomeNewP@ssw0rd', name: `Still Me ${suffix}` });

      expect([200, 400]).toContain(res.status);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');

      const [row] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(inArray(users.id, [self.id]));
      expect(row.passwordHash).toBe('not-a-real-hash');
    });
  });

  describe('GET /users — FindUsersDto validation and filtering (BVA + real rows)', () => {
    let admin: Awaited<ReturnType<typeof createUser>>;
    let adminToken: string;
    let fixtureA: Awaited<ReturnType<typeof createUser>>;
    let fixtureB: Awaited<ReturnType<typeof createUser>>;
    let fixtureAdmin: Awaited<ReturnType<typeof createUser>>;

    beforeAll(async () => {
      admin = await createUser({ role: Role.ADMIN });
      adminToken = tokenFor(admin);
      fixtureA = await createUser({
        name: `Filter Alpha ${suffix}`,
        email: `filter-alpha-${suffix}@example.com`,
        role: Role.USER,
      });
      fixtureB = await createUser({
        name: `Filter Beta ${suffix}`,
        email: `filter-beta-${suffix}@example.com`,
        role: Role.USER,
      });
      fixtureAdmin = await createUser({
        name: `Filter Gamma Admin ${suffix}`,
        email: `filter-gamma-${suffix}@example.com`,
        role: Role.ADMIN,
      });
    });

    it('page: boundary 1 => 200; below boundary 0 => 400', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .query({ page: 1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .query({ page: 0 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('limit: lower boundary 1 => 200; below boundary 0 => 400', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 0 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('limit: upper boundary 100 => 200; above boundary 101 => 400', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 101 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('role: valid enum value => 200; invalid enum value => 400', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .query({ role: Role.ADMIN })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .query({ role: 'superadmin' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('filters by email substring, case-insensitive', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ email: `FILTER-ALPHA-${suffix}`, limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(fixtureA.id);
      expect(ids).not.toContain(fixtureB.id);
    });

    it('filters by name substring, case-insensitive (mixed case query)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ name: `filter beta`.toUpperCase(), limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(fixtureB.id);
      expect(ids).not.toContain(fixtureA.id);
    });

    it('filters by role: admin excludes plain users from the fixture set', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ role: Role.ADMIN, name: `Filter`, limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(fixtureAdmin.id);
      expect(ids).not.toContain(fixtureA.id);
      expect(ids).not.toContain(fixtureB.id);
    });

    it('combines name + role filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ name: `Filter`, role: Role.USER, limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(fixtureA.id);
      expect(ids).toContain(fixtureB.id);
      expect(ids).not.toContain(fixtureAdmin.id);
    });

    it('paginates: limit constrains page size and meta.total reflects the full filtered count', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/users')
        .query({ name: 'Filter', limit: 2, page: 1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.meta.total).toBe(3);
      expect(page1.body.meta.totalPages).toBe(2);
    });
  });
});
