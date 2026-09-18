import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { Role } from '../shared/enums/role.enums.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { customValidationPipe } from '../pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

// Test design: see specs/listings-crud.md (source of truth) +
// .claude/skills/testing/SKILL.md.
//
// Plain unit tests (mocked ListingsService) cover guard wiring per-route,
// delegation, and response shaping. A second block bootstraps the real Nest
// HTTP pipeline (real JwtAuthGuard/RolesGuard/ValidationPipe/ExceptionFilter,
// mocked ListingsService + JwtService) via supertest — per the testing
// skill's scope gate, "an auth flow spanning guard + service" is a case
// where a service-level mock would paper over the real behavior, so this
// exercises the guards and the global validation pipe for real over HTTP.
// A separate test/listings.e2e-spec.ts additionally exercises the real
// Postgres constraints (unique/FK violations) that only surface with a real
// database underneath.

const sampleListing = {
  id: 1,
  fragranceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  vendorId: 1,
  sizeMl: 100,
  price: 89990,
  url: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
  inStock: true,
  scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ListingsController (unit, mocked service)', () => {
  let controller: ListingsController;
  let service: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      removeMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListingsController],
      providers: [
        { provide: ListingsService, useValue: service },
        { provide: DRIZZLE, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ListingsController>(ListingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Spec: GET /listings and GET /listings/:id are public (no guards); only
  // the batch mutation routes carry JwtAuthGuard + RolesGuard(ADMIN). Unlike
  // fragrances (guarded at the controller level), listings applies guards
  // per-method, so each route's own metadata must be checked individually —
  // there is no class-level decorator to fall back on.
  describe('per-route guard wiring', () => {
    it('has no controller-level guards/roles (unlike the fragrances module)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ListingsController);
      const roles = Reflect.getMetadata(ROLES_KEY, ListingsController);
      expect(guards).toBeUndefined();
      expect(roles).toBeUndefined();
    });

    it.each(['findAll', 'findOne'] as const)(
      '%s (read route) carries no guards/roles',
      (method) => {
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          ListingsController.prototype[method],
        );
        const roles = Reflect.getMetadata(
          ROLES_KEY,
          ListingsController.prototype[method],
        );
        expect(guards).toBeUndefined();
        expect(roles).toBeUndefined();
      },
    );

    it.each(['createMany', 'updateMany', 'removeMany'] as const)(
      '%s (batch mutation route) requires JwtAuthGuard + RolesGuard + Role.ADMIN',
      (method) => {
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          ListingsController.prototype[method],
        );
        const roles = Reflect.getMetadata(
          ROLES_KEY,
          ListingsController.prototype[method],
        );
        expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
        expect(roles).toEqual([Role.ADMIN]);
      },
    );
  });

  describe('delegation to ListingsService', () => {
    it('findAll delegates to the service and passes through the cursor', async () => {
      service.findAll.mockResolvedValue({
        data: [sampleListing],
        nextCursor: 1,
      });
      const query = { cursor: 1, limit: 20 };

      const result = await controller.findAll(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result.nextCursor).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 1,
        fragranceId: sampleListing.fragranceId,
      });
    });

    it('findAll response only exposes ResponseListingDto fields', async () => {
      service.findAll.mockResolvedValue({
        data: [{ ...sampleListing, internalScraperNotes: 'do-not-leak' }],
        nextCursor: null,
      });

      const result = await controller.findAll({ limit: 20 } as any);

      expect(result.data[0]).not.toHaveProperty('internalScraperNotes');
    });

    it('returns nextCursor: null when the page is shorter than the limit', async () => {
      service.findAll.mockResolvedValue({ data: [], nextCursor: null });

      const result = await controller.findAll({ limit: 20 } as any);

      expect(result.nextCursor).toBeNull();
    });

    it('findOne delegates to the service with the parsed numeric id', async () => {
      service.findOne.mockResolvedValue(sampleListing);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toMatchObject({ id: 1 });
    });

    it('createMany delegates dto.items and wraps the results', async () => {
      service.createMany.mockResolvedValue([{ id: 1, success: true }]);
      const items = [
        {
          fragranceId: sampleListing.fragranceId,
          vendorId: 1,
          sizeMl: 100,
          price: 89990,
          url: sampleListing.url,
        },
      ];

      const result = await controller.createMany({ items } as any);

      expect(service.createMany).toHaveBeenCalledWith(items);
      expect(result).toEqual({ results: [{ id: 1, success: true }] });
    });

    it('updateMany delegates dto.items and wraps the results', async () => {
      service.updateMany.mockResolvedValue([{ id: 1, success: true }]);
      const items = [{ id: 1, price: 79990 }];

      const result = await controller.updateMany({ items } as any);

      expect(service.updateMany).toHaveBeenCalledWith(items);
      expect(result).toEqual({ results: [{ id: 1, success: true }] });
    });

    it('removeMany delegates dto.ids and wraps the results', async () => {
      service.removeMany.mockResolvedValue([{ id: 1, success: true }]);
      const ids = [1];

      const result = await controller.removeMany({ ids } as any);

      expect(service.removeMany).toHaveBeenCalledWith(ids);
      expect(result).toEqual({ results: [{ id: 1, success: true }] });
    });
  });
});

describe('ListingsController (HTTP, real guards + validation pipe)', () => {
  let app: INestApplication<App>;
  let service: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  const ADMIN_TOKEN = 'valid-admin-token';
  const USER_TOKEN = 'valid-user-token';
  const VALID_ITEM = {
    fragranceId: sampleListing.fragranceId,
    vendorId: 1,
    sizeMl: 100,
    price: 89990,
    url: sampleListing.url,
  };

  beforeEach(async () => {
    service = {
      findAll: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
      findOne: vi.fn(),
      createMany: vi.fn().mockResolvedValue([{ id: 1, success: true }]),
      updateMany: vi.fn().mockResolvedValue([{ id: 1, success: true }]),
      removeMany: vi.fn().mockResolvedValue([{ id: 1, success: true }]),
    };

    jwtService = {
      verifyAsync: vi.fn(async (token: string) => {
        if (token === ADMIN_TOKEN) {
          return { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
        }
        if (token === USER_TOKEN) {
          return { sub: 2, email: 'user@example.com', role: Role.USER };
        }
        throw new Error('invalid token');
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ListingsController],
      providers: [
        { provide: ListingsService, useValue: service },
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

  describe('GET /listings', () => {
    it('is public: no Authorization header required', async () => {
      await request(app.getHttpServer()).get('/listings').expect(200);
    });

    it('accepts a combination of every documented filter at once', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({
          fragranceId: sampleListing.fragranceId,
          vendorId: '1',
          inStock: 'true',
          minPrice: '1000',
          maxPrice: '100000',
          cursor: '5',
          limit: '10',
        })
        .expect(200);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          fragranceId: sampleListing.fragranceId,
          vendorId: 1,
          inStock: true,
          minPrice: 1000,
          maxPrice: 100000,
          cursor: 5,
          limit: 10,
        }),
      );
    });

    it('rejects a non-uuid fragranceId filter', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ fragranceId: 'not-a-uuid' })
        .expect(400);
    });

    it('rejects a non-numeric vendorId filter', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ vendorId: 'abc' })
        .expect(400);
    });

    it.each([
      ['inStock=true (transformed to boolean true)', 'true', true],
      ['inStock=false (transformed to boolean false)', 'false', false],
    ])('%s', async (_label, raw, expected) => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ inStock: raw })
        .expect(200);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ inStock: expected }),
      );
    });

    it('rejects a non-boolean inStock filter', async () => {
      await request(app.getHttpServer())
        .get('/listings')
        .query({ inStock: 'maybe' })
        .expect(400);
    });

    // BVA on FindListingsDto: cursor @Min(1); limit @Min(1)/@Max(100);
    // minPrice/maxPrice @Min(0).
    it.each([
      ['cursor=1 (boundary, valid)', { cursor: '1' }, 200],
      ['cursor=0 (across boundary, invalid)', { cursor: '0' }, 400],
      ['cursor=-1 (invalid)', { cursor: '-1' }, 400],
      ['limit=1 (boundary, valid)', { limit: '1' }, 200],
      ['limit=0 (across boundary, invalid)', { limit: '0' }, 400],
      ['limit=100 (boundary, valid)', { limit: '100' }, 200],
      ['limit=101 (across boundary, invalid)', { limit: '101' }, 400],
      ['non-numeric cursor (invalid)', { cursor: 'abc' }, 400],
      ['non-integer cursor (invalid)', { cursor: '1.5' }, 400],
      ['minPrice=0 (boundary, valid)', { minPrice: '0' }, 200],
      ['minPrice=-1 (across boundary, invalid)', { minPrice: '-1' }, 400],
      ['maxPrice=0 (boundary, valid)', { maxPrice: '0' }, 200],
      ['maxPrice=-1 (across boundary, invalid)', { maxPrice: '-1' }, 400],
    ])('%s', async (_label, query, expectedStatus) => {
      await request(app.getHttpServer())
        .get('/listings')
        .query(query)
        .expect(expectedStatus);
    });

    it('applies the documented default limit (20), no cursor, when omitted', async () => {
      await request(app.getHttpServer()).get('/listings').expect(200);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20 }),
      );
      expect(service.findAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ cursor: expect.anything() }),
      );
    });
  });

  describe('GET /listings/:id', () => {
    it('is public: no Authorization header required', async () => {
      service.findOne.mockResolvedValue(sampleListing);

      await request(app.getHttpServer()).get('/listings/1').expect(200);
    });

    it('returns 404 when the listing does not exist', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Listing 999 not found'),
      );

      await request(app.getHttpServer()).get('/listings/999').expect(404);
    });

    it('returns 400 for a non-numeric id (ParseIntPipe)', async () => {
      await request(app.getHttpServer())
        .get('/listings/not-a-number')
        .expect(400);
    });
  });

  // Decision table for auth on the batch routes: token state x role. Full
  // combinatorial run on POST; PATCH/DELETE get a smaller check
  // (admin-success + one rejection) since all three routes carry identical
  // @UseGuards/@Roles decorators — downgraded from full 4x3 combinatorial to
  // avoid redundant coverage of the same guard wiring three times.
  describe('POST /listings/batch — auth decision table', () => {
    const body = { items: [VALID_ITEM] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .send(body)
        .expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', 'Bearer garbage-token')
        .send(body)
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(body)
        .expect(403);
    });

    it('valid token with admin role -> 201', async () => {
      await request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(201);
    });
  });

  describe('PATCH /listings/batch — guard smoke check', () => {
    const body = { items: [{ id: 1, price: 79990 }] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .patch('/listings/batch')
        .send(body)
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(body)
        .expect(403);
    });

    it('valid token with admin role -> 200', async () => {
      await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(200);
    });
  });

  describe('DELETE /listings/batch — guard smoke check', () => {
    const body = { ids: [1] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .delete('/listings/batch')
        .send(body)
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(body)
        .expect(403);
    });

    it('valid token with admin role -> 200', async () => {
      await request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(200);
    });
  });

  describe('POST /listings/batch — CreateListingDto validation (BVA)', () => {
    const authed = () =>
      request(app.getHttpServer())
        .post('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    it('rejects an empty items array', async () => {
      await authed().send({ items: [] }).expect(400);
    });

    it('rejects a missing fragranceId', async () => {
      const { fragranceId: _fragranceId, ...rest } = VALID_ITEM;
      await authed()
        .send({ items: [rest] })
        .expect(400);
    });

    it('rejects a non-uuid fragranceId', async () => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, fragranceId: 'not-a-uuid' }] })
        .expect(400);
    });

    it.each([
      ['vendorId', 'vendorId'],
      ['sizeMl', 'sizeMl'],
      ['price', 'price'],
    ] as const)(
      'accepts %s at its lower boundary, 1',
      async (_label, field) => {
        await authed()
          .send({ items: [{ ...VALID_ITEM, [field]: 1 }] })
          .expect(201);
      },
    );

    it.each([
      ['vendorId', 'vendorId'],
      ['sizeMl', 'sizeMl'],
      ['price', 'price'],
    ] as const)(
      'rejects %s one past the lower boundary (0)',
      async (_label, field) => {
        await authed()
          .send({ items: [{ ...VALID_ITEM, [field]: 0 }] })
          .expect(400);
      },
    );

    it('rejects a non-integer price', async () => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, price: 99.99 }] })
        .expect(400);
    });

    it('rejects an invalid url', async () => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, url: 'not-a-url' }] })
        .expect(400);
    });

    it('rejects a url with a disallowed protocol', async () => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, url: 'ftp://example.com/a' }] })
        .expect(400);
    });

    it('accepts url at the 500-char boundary', async () => {
      const base = 'https://a.example.com/';
      const url = base + 'x'.repeat(500 - base.length);
      expect(url).toHaveLength(500);

      await authed()
        .send({ items: [{ ...VALID_ITEM, url }] })
        .expect(201);
    });

    it('rejects url one character past the 500-char boundary', async () => {
      const base = 'https://a.example.com/';
      const url = base + 'x'.repeat(501 - base.length);
      expect(url).toHaveLength(501);

      await authed()
        .send({ items: [{ ...VALID_ITEM, url }] })
        .expect(400);
    });

    it('accepts inStock omitted', async () => {
      await authed()
        .send({ items: [VALID_ITEM] })
        .expect(201);
    });

    it.each([true, false])('accepts inStock: %s', async (inStock) => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, inStock }] })
        .expect(201);
    });

    it('rejects a non-boolean inStock', async () => {
      await authed()
        .send({ items: [{ ...VALID_ITEM, inStock: 'yes' }] })
        .expect(400);
    });
  });

  describe('DELETE /listings/batch — BatchDeleteListingsDto validation', () => {
    const authed = () =>
      request(app.getHttpServer())
        .delete('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    it('rejects an empty ids array', async () => {
      await authed().send({ ids: [] }).expect(400);
    });

    it('rejects a non-integer id', async () => {
      await authed()
        .send({ ids: [1.5] })
        .expect(400);
    });
  });

  describe('PATCH /listings/batch — BatchUpdateListingsDto validation', () => {
    it('rejects an item missing id', async () => {
      await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ items: [{ price: 1000 }] })
        .expect(400);
    });

    it('accepts an item with only id (no other field changed)', async () => {
      await request(app.getHttpServer())
        .patch('/listings/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ items: [{ id: 1 }] })
        .expect(200);
    });
  });
});
