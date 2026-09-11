import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { Role } from '../shared/enums/role.enums.js';
import { customValidationPipe } from '../pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

// Test design: see specs/vendors-crud.md (source of truth) +
// .claude/skills/testing/SKILL.md.
//
// Plain unit tests (mocked VendorsService) cover delegation and response
// shaping. A second block bootstraps the real Nest HTTP pipeline (real
// JwtAuthGuard/RolesGuard/ValidationPipe/ExceptionFilter, mocked
// VendorsService + JwtService) via supertest: per the testing skill's scope
// gate, "an auth flow spanning guard + strategy + service" is a case where a
// service-level mock would paper over the real behavior, so this exercises
// the guards and the global validation pipe for real over HTTP.

describe('VendorsController (unit, mocked service)', () => {
  let controller: VendorsController;
  let vendorsService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vendorsService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      removeMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        { provide: VendorsService, useValue: vendorsService },
        { provide: JwtService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<VendorsController>(VendorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const vendor = {
    id: 1,
    name: 'Fragrantica Store',
    websiteUrl: 'https://www.example-store.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('findAll delegates to the service and builds pagination meta', async () => {
    vendorsService.findAll.mockResolvedValue({ data: [vendor], total: 42 });
    const query = { page: 2, limit: 20 };

    const result = await controller.findAll(query);

    expect(vendorsService.findAll).toHaveBeenCalledWith(query);
    expect(result.meta).toEqual({ page: 2, limit: 20, total: 42, totalPages: 3 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 1, name: vendor.name });
  });

  it('findAll response only exposes ResponseVendorDto fields', async () => {
    vendorsService.findAll.mockResolvedValue({
      data: [{ ...vendor, internalSecret: 'do-not-leak' }],
      total: 1,
    });

    const result = await controller.findAll({ page: 1, limit: 20 });

    expect(result.data[0]).not.toHaveProperty('internalSecret');
  });

  it('findOne delegates to the service', async () => {
    vendorsService.findOne.mockResolvedValue(vendor);

    const result = await controller.findOne(1);

    expect(vendorsService.findOne).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({ id: 1, name: vendor.name });
  });

  it('createMany delegates the items array and wraps results', async () => {
    vendorsService.createMany.mockResolvedValue([{ id: 1, success: true }]);
    const dto = { items: [{ name: 'A', websiteUrl: 'https://a.example.com' }] };

    const result = await controller.createMany(dto);

    expect(vendorsService.createMany).toHaveBeenCalledWith(dto.items);
    expect(result).toEqual({ results: [{ id: 1, success: true }] });
  });

  it('updateMany delegates the items array and wraps results', async () => {
    vendorsService.updateMany.mockResolvedValue([{ id: 1, success: true }]);
    const dto = { items: [{ id: 1, name: 'New name' }] };

    const result = await controller.updateMany(dto);

    expect(vendorsService.updateMany).toHaveBeenCalledWith(dto.items);
    expect(result).toEqual({ results: [{ id: 1, success: true }] });
  });

  it('removeMany delegates the ids array and wraps results', async () => {
    vendorsService.removeMany.mockResolvedValue([{ id: 1, success: true }]);
    const dto = { ids: [1] };

    const result = await controller.removeMany(dto);

    expect(vendorsService.removeMany).toHaveBeenCalledWith(dto.ids);
    expect(result).toEqual({ results: [{ id: 1, success: true }] });
  });
});

describe('VendorsController (HTTP, real guards + validation pipe)', () => {
  let app: INestApplication<App>;
  let vendorsService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    removeMany: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  const ADMIN_TOKEN = 'valid-admin-token';
  const USER_TOKEN = 'valid-user-token';

  beforeEach(async () => {
    vendorsService = {
      findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
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
      controllers: [VendorsController],
      providers: [
        { provide: VendorsService, useValue: vendorsService },
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

  describe('GET /vendors', () => {
    it('is public: no Authorization header required', async () => {
      await request(app.getHttpServer()).get('/vendors').expect(200);
    });

    // BVA on FindVendorsDto: page @Min(1), limit @Min(1)/@Max(100).
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
        .get(`/vendors${qs}`)
        .expect(expectedStatus);
    });
  });

  describe('GET /vendors/:id', () => {
    it('returns 200 with the vendor when found', async () => {
      vendorsService.findOne.mockResolvedValue({
        id: 1,
        name: 'A',
        websiteUrl: 'https://a.example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app.getHttpServer()).get('/vendors/1').expect(200);
    });

    it('returns 404 when the vendor does not exist', async () => {
      vendorsService.findOne.mockRejectedValue(new NotFoundException('Vendor 999 not found'));

      await request(app.getHttpServer()).get('/vendors/999').expect(404);
    });

    it('returns 400 for a non-numeric id', async () => {
      await request(app.getHttpServer()).get('/vendors/not-a-number').expect(400);
    });
  });

  // Decision table for auth on the batch routes: token state x role.
  // Full combinatorial run on POST; PATCH/DELETE get a smaller check
  // (admin-success + one rejection) since all three routes carry identical
  // @UseGuards/@Roles decorators — downgraded from full 4x3 combinatorial
  // to avoid redundant coverage of the same guard wiring three times.
  describe('POST /vendors/batch — auth decision table', () => {
    const body = { items: [{ name: 'A', websiteUrl: 'https://a.example.com' }] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).post('/vendors/batch').send(body).expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', 'Bearer garbage-token')
        .send(body)
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(body)
        .expect(403);
    });

    it('valid token with admin role -> 201', async () => {
      await request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(201);
    });
  });

  describe('PATCH /vendors/batch — guard smoke check', () => {
    const body = { items: [{ id: 1, name: 'New name' }] };

    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).patch('/vendors/batch').send(body).expect(401);
    });

    it('valid token with admin role -> 200', async () => {
      await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(200);
    });
  });

  describe('DELETE /vendors/batch — guard smoke check', () => {
    const body = { ids: [1] };

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(body)
        .expect(403);
    });

    it('valid token with admin role -> 200', async () => {
      await request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(body)
        .expect(200);
    });
  });

  describe('POST /vendors/batch — CreateVendorDto validation (BVA)', () => {
    const authed = () =>
      request(app.getHttpServer())
        .post('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    it('rejects an empty items array', async () => {
      await authed().send({ items: [] }).expect(400);
    });

    it('rejects a missing name', async () => {
      await authed()
        .send({ items: [{ websiteUrl: 'https://a.example.com' }] })
        .expect(400);
    });

    it('accepts name at the 128-char boundary', async () => {
      await authed()
        .send({ items: [{ name: 'a'.repeat(128), websiteUrl: 'https://a.example.com' }] })
        .expect(201);
    });

    it('rejects name one character past the 128-char boundary', async () => {
      await authed()
        .send({ items: [{ name: 'a'.repeat(129), websiteUrl: 'https://a.example.com' }] })
        .expect(400);
    });

    it('rejects an invalid websiteUrl', async () => {
      await authed()
        .send({ items: [{ name: 'A', websiteUrl: 'not-a-url' }] })
        .expect(400);
    });

    it('rejects a websiteUrl with a disallowed protocol', async () => {
      await authed()
        .send({ items: [{ name: 'A', websiteUrl: 'ftp://a.example.com' }] })
        .expect(400);
    });

    it('accepts websiteUrl at the 255-char boundary', async () => {
      const base = 'https://a.example.com/';
      const websiteUrl = base + 'x'.repeat(255 - base.length);
      expect(websiteUrl).toHaveLength(255);

      await authed().send({ items: [{ name: 'A', websiteUrl }] }).expect(201);
    });

    it('rejects websiteUrl one character past the 255-char boundary', async () => {
      const base = 'https://a.example.com/';
      const websiteUrl = base + 'x'.repeat(256 - base.length);
      expect(websiteUrl).toHaveLength(256);

      await authed().send({ items: [{ name: 'A', websiteUrl }] }).expect(400);
    });
  });

  describe('DELETE /vendors/batch — BatchDeleteVendorsDto validation', () => {
    const authed = () =>
      request(app.getHttpServer())
        .delete('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    it('rejects an empty ids array', async () => {
      await authed().send({ ids: [] }).expect(400);
    });

    it('rejects a non-integer id', async () => {
      await authed().send({ ids: [1.5] }).expect(400);
    });
  });

  describe('PATCH /vendors/batch — BatchUpdateVendorsDto validation', () => {
    it('rejects an item missing id', async () => {
      await request(app.getHttpServer())
        .patch('/vendors/batch')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ items: [{ name: 'No id' }] })
        .expect(400);
    });
  });
});
