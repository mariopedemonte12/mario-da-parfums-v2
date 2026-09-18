import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { Role } from '../shared/enums/role.enums.js';
import { customValidationPipe } from '../pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

// Test design: see specs/favorite-module.md (source of truth) +
// .claude/skills/testing/SKILL.md.
//
// Plain unit tests (mocked FavoritesService) cover delegation, in
// particular that the acting userId always comes from the JWT (`sub`), not
// from any client-supplied value. A second block bootstraps the real Nest
// HTTP pipeline (real JwtAuthGuard/ValidationPipe/ExceptionFilter, mocked
// FavoritesService + JwtService) via supertest: per the testing skill's
// scope gate, "an auth flow spanning guard + strategy + service" is a case
// where a service-level mock would paper over the real behavior — this also
// exercises cross-user isolation as it actually happens over HTTP (two
// different bearer tokens must resolve to two different `sub`s reaching the
// service, and no role restriction should apply to any of them).

describe('FavoritesController (unit, mocked service)', () => {
  let controller: FavoritesController;
  let favoritesService: {
    findAllForUser: ReturnType<typeof vi.fn>;
    getFavoritesCount: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };

  const userPayload = { sub: 1, email: 'user@example.com', role: Role.USER };

  beforeEach(async () => {
    favoritesService = {
      findAllForUser: vi.fn(),
      getFavoritesCount: vi.fn(),
      createMany: vi.fn(),
      removeMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        { provide: FavoritesService, useValue: favoritesService },
        { provide: JwtService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<FavoritesController>(FavoritesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll scopes to the caller: passes JWT sub, not any client-supplied id', async () => {
    favoritesService.findAllForUser.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { page: 1, limit: 20 };

    await controller.findAll(userPayload, query);

    expect(favoritesService.findAllForUser).toHaveBeenCalledWith(1, query);
  });

  it('getFavoritesCount delegates the fragranceId param', async () => {
    favoritesService.getFavoritesCount.mockResolvedValue({
      fragranceId: 'frag-1',
      favoritesCount: 5,
    });

    const result = await controller.getFavoritesCount('frag-1');

    expect(favoritesService.getFavoritesCount).toHaveBeenCalledWith('frag-1');
    expect(result).toEqual({ fragranceId: 'frag-1', favoritesCount: 5 });
  });

  it('createBatch scopes to the caller and forwards the fragranceIds array', async () => {
    favoritesService.createMany.mockResolvedValue([
      { fragranceId: 'frag-1', success: true, id: 1 },
    ]);
    const dto = { fragranceIds: ['frag-1'] };

    const result = await controller.createBatch(userPayload, dto);

    expect(favoritesService.createMany).toHaveBeenCalledWith(
      1,
      dto.fragranceIds,
    );
    expect(result).toEqual([{ fragranceId: 'frag-1', success: true, id: 1 }]);
  });

  it('removeBatch scopes to the caller and forwards the fragranceIds array', async () => {
    favoritesService.removeMany.mockResolvedValue([
      { fragranceId: 'frag-1', success: true },
    ]);
    const dto = { fragranceIds: ['frag-1'] };

    const result = await controller.removeBatch(userPayload, dto);

    expect(favoritesService.removeMany).toHaveBeenCalledWith(
      1,
      dto.fragranceIds,
    );
    expect(result).toEqual([{ fragranceId: 'frag-1', success: true }]);
  });

  it('a different caller (different JWT sub) is passed through as a different userId', async () => {
    favoritesService.findAllForUser.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const otherUser = { sub: 99, email: 'other@example.com', role: Role.ADMIN };

    await controller.findAll(otherUser, { page: 1, limit: 20 });

    expect(favoritesService.findAllForUser).toHaveBeenCalledWith(
      99,
      expect.anything(),
    );
  });
});

describe('FavoritesController (HTTP, real guard + validation pipe)', () => {
  let app: INestApplication<App>;
  let favoritesService: {
    findAllForUser: ReturnType<typeof vi.fn>;
    getFavoritesCount: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  const USER_A_TOKEN = 'valid-user-a-token';
  const USER_B_TOKEN = 'valid-user-b-token';
  const ADMIN_TOKEN = 'valid-admin-token';

  beforeEach(async () => {
    favoritesService = {
      findAllForUser: vi
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      getFavoritesCount: vi
        .fn()
        .mockResolvedValue({ fragranceId: 'frag-1', favoritesCount: 0 }),
      createMany: vi
        .fn()
        .mockResolvedValue([{ fragranceId: 'frag-1', success: true, id: 1 }]),
      removeMany: vi
        .fn()
        .mockResolvedValue([{ fragranceId: 'frag-1', success: true }]),
    };

    jwtService = {
      verifyAsync: vi.fn(async (token: string) => {
        if (token === USER_A_TOKEN) {
          return { sub: 1, email: 'user-a@example.com', role: Role.USER };
        }
        if (token === USER_B_TOKEN) {
          return { sub: 2, email: 'user-b@example.com', role: Role.USER };
        }
        if (token === ADMIN_TOKEN) {
          return { sub: 3, email: 'admin@example.com', role: Role.ADMIN };
        }
        throw new Error('invalid token');
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        { provide: FavoritesService, useValue: favoritesService },
        { provide: JwtService, useValue: jwtService },
        // Present so nothing accidentally reaches a real pool if a code
        // path is added later that injects DRIZZLE into the controller.
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(customValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Auth decision table for the guard wiring shared by all four routes
  // (`@UseGuards(JwtAuthGuard)` at the controller level, no `@Roles`). Full
  // check on GET /favorites; the other three routes get a smaller guard
  // smoke check since they carry identical class-level guard wiring.
  describe('GET /favorites — auth', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).get('/favorites').expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });

    it('valid token, USER role -> 200', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(200);
    });

    // Spec: no role restriction on any favorites route — an ADMIN favorites
    // fragrances exactly like a USER, so this must NOT be 403.
    it('valid token, ADMIN role -> 200 (no role restriction)', async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
    });
  });

  describe('GET /favorites/fragrances/:fragranceId/count — guard smoke check', () => {
    const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .get(`/favorites/fragrances/${uuid}/count`)
        .expect(401);
    });

    it('valid token -> 200', async () => {
      await request(app.getHttpServer())
        .get(`/favorites/fragrances/${uuid}/count`)
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(200);
    });
  });

  describe('POST /favorites/batch — guard smoke check', () => {
    const body = { fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .post('/favorites/batch')
        .send(body)
        .expect(401);
    });

    it('valid token, USER role -> 201', async () => {
      await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .send(body)
        .expect(201);
    });
  });

  describe('DELETE /favorites/batch — guard smoke check', () => {
    const body = { fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .delete('/favorites/batch')
        .send(body)
        .expect(401);
    });

    it('valid token, USER role -> 200', async () => {
      await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .send(body)
        .expect(200);
    });
  });

  // Cross-user isolation as it happens over the real HTTP pipeline: two
  // different bearer tokens for two different users must resolve to two
  // different `sub`s reaching the service, on every mutating/listing route.
  // A bug here (e.g. a hardcoded/cached user, or trusting a body field)
  // would let one user's request act on another user's favorites.
  describe('cross-user isolation over HTTP', () => {
    it("GET /favorites uses the sub from the caller's own token", async () => {
      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(200);
      expect(favoritesService.findAllForUser).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );

      await request(app.getHttpServer())
        .get('/favorites')
        .set('Authorization', `Bearer ${USER_B_TOKEN}`)
        .expect(200);
      expect(favoritesService.findAllForUser).toHaveBeenCalledWith(
        2,
        expect.anything(),
      );
    });

    it('POST /favorites/batch marks a favorite for the token owner, never a caller-supplied id', async () => {
      const body = { fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] };

      await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${USER_B_TOKEN}`)
        .send(body)
        .expect(201);

      expect(favoritesService.createMany).toHaveBeenCalledWith(
        2,
        body.fragranceIds,
      );
    });

    it('DELETE /favorites/batch unmarks a favorite for the token owner, never a caller-supplied id', async () => {
      const body = { fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] };

      await request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${USER_B_TOKEN}`)
        .send(body)
        .expect(200);

      expect(favoritesService.removeMany).toHaveBeenCalledWith(
        2,
        body.fragranceIds,
      );
    });

    // Neither batch DTO has a userId/user field at all, but this pins that
    // even if a client sends one, the guard/decorator-derived sub wins —
    // there is no path for a body field to reach the service as the actor.
    it('a body-supplied user field is ignored; the JWT sub still wins', async () => {
      const body = {
        fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
        userId: 999,
        sub: 999,
      };

      await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .send(body)
        .expect(201);

      expect(favoritesService.createMany).toHaveBeenCalledWith(
        1,
        body.fragranceIds,
      );
    });
  });

  describe('GET /favorites/fragrances/:fragranceId/count — validation + not-found', () => {
    it('rejects a non-UUID fragranceId', async () => {
      await request(app.getHttpServer())
        .get('/favorites/fragrances/not-a-uuid/count')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(400);
    });

    it('returns 404 when the fragrance does not exist', async () => {
      favoritesService.getFavoritesCount.mockRejectedValue(
        new NotFoundException('Fragrance not found'),
      );

      await request(app.getHttpServer())
        .get('/favorites/fragrances/3fa85f64-5717-4562-b3fc-2c963f66afa6/count')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(404);
    });
  });

  // BVA on FindFavoritesDto: page @Min(1), limit @Min(1)/@Max(100).
  describe('GET /favorites — FindFavoritesDto validation (BVA)', () => {
    it.each([
      ['page=1 (boundary, valid)', '?page=1', 200],
      ['page=0 (across boundary, invalid)', '?page=0', 400],
      ['limit=1 (boundary, valid)', '?limit=1', 200],
      ['limit=0 (across boundary, invalid)', '?limit=0', 400],
      ['limit=100 (boundary, valid)', '?limit=100', 200],
      ['limit=101 (across boundary, invalid)', '?limit=101', 400],
      ['non-numeric page (invalid)', '?page=abc', 400],
    ])('%s', async (_label, qs, expectedStatus) => {
      await request(app.getHttpServer())
        .get(`/favorites${qs}`)
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .expect(expectedStatus);
    });
  });

  describe('POST /favorites/batch — CreateFavoriteBatchDto validation', () => {
    const authed = () =>
      request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`);

    it('rejects an empty fragranceIds array', async () => {
      await authed().send({ fragranceIds: [] }).expect(400);
    });

    it('rejects a missing fragranceIds field', async () => {
      await authed().send({}).expect(400);
    });

    it('rejects a non-UUID entry', async () => {
      await authed()
        .send({ fragranceIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('accepts a valid single-element array', async () => {
      await authed()
        .send({ fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
        .expect(201);
    });

    it('accepts multiple valid UUIDs and rejects if any one is malformed', async () => {
      await authed()
        .send({
          fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'not-a-uuid'],
        })
        .expect(400);
    });
  });

  describe('DELETE /favorites/batch — DeleteFavoriteBatchDto validation', () => {
    const authed = () =>
      request(app.getHttpServer())
        .delete('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`);

    it('rejects an empty fragranceIds array', async () => {
      await authed().send({ fragranceIds: [] }).expect(400);
    });

    it('rejects a non-UUID entry', async () => {
      await authed()
        .send({ fragranceIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('accepts a valid single-element array', async () => {
      await authed()
        .send({ fragranceIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
        .expect(200);
    });
  });

  describe('POST /favorites/batch — partial-success response shape', () => {
    it('returns 201 even when the batch reports per-item conflicts (no batch-level abort)', async () => {
      favoritesService.createMany.mockResolvedValue([
        { fragranceId: 'a', success: true, id: 1 },
        {
          fragranceId: 'b',
          success: false,
          error: 'Fragrance already marked as favorite',
        },
      ]);

      const response = await request(app.getHttpServer())
        .post('/favorites/batch')
        .set('Authorization', `Bearer ${USER_A_TOKEN}`)
        .send({
          fragranceIds: [
            '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            '3fa85f64-5717-4562-b3fc-2c963f66afa7',
          ],
        })
        .expect(201);

      expect(response.body).toEqual([
        { fragranceId: 'a', success: true, id: 1 },
        {
          fragranceId: 'b',
          success: false,
          error: 'Fragrance already marked as favorite',
        },
      ]);
    });
  });
});
