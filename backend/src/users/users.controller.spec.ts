import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { Role } from '../shared/enums/role.enums.js';
import { customValidationPipe } from '../pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

// Test design: see specs/users-crud.md (source of truth) +
// .claude/skills/testing/SKILL.md.
//
// Plain unit tests (mocked UsersService) cover delegation and response
// shaping. A second block bootstraps the real Nest HTTP pipeline (real
// JwtAuthGuard/RolesGuard/SelfOrAdminGuard/ValidationPipe/ExceptionFilter,
// mocked UsersService + JwtService) via supertest, following the same
// pattern as vendors.controller.spec.ts: the guard combination here is
// exactly the feature's security fix (self-or-admin, role/password stripped
// from PATCH), so a service-level mock alone would paper over it.

describe('UsersController (unit, mocked service)', () => {
  let controller: UsersController;
  let usersService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const user = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: Role.USER,
    passwordHash: 'hashed',
    photoS3Key: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    usersService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll delegates to the service and builds pagination meta', async () => {
    usersService.findAll.mockResolvedValue({ data: [user], total: 42 });
    const query = { page: 2, limit: 20 };

    const result = await controller.findAll(query);

    expect(usersService.findAll).toHaveBeenCalledWith(query);
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 42,
      totalPages: 3,
    });
    expect(result.data[0]).toMatchObject({ id: 1, email: user.email });
  });

  it('findAll response never exposes passwordHash', async () => {
    usersService.findAll.mockResolvedValue({ data: [user], total: 1 });

    const result = await controller.findAll({ page: 1, limit: 20 });

    expect(result.data[0]).not.toHaveProperty('passwordHash');
  });

  it('findOne delegates to the service and strips passwordHash', async () => {
    usersService.findOne.mockResolvedValue(user);

    const result = await controller.findOne(1);

    expect(usersService.findOne).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({ id: 1, email: user.email });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('update delegates the id and dto to the service', async () => {
    usersService.update.mockResolvedValue({ ...user, name: 'New Name' });
    const dto = { name: 'New Name' };

    const result = await controller.update(1, dto);

    expect(usersService.update).toHaveBeenCalledWith(1, dto);
    expect(result.name).toBe('New Name');
  });

  it('remove delegates to the service', async () => {
    usersService.remove.mockResolvedValue(undefined);

    await controller.remove(1);

    expect(usersService.remove).toHaveBeenCalledWith(1);
  });
});

describe('UsersController (HTTP, real guards + validation pipe)', () => {
  let app: INestApplication<App>;
  let usersService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  // sub 1 = admin, sub 2 = a regular user ("self" from that user's POV).
  const ADMIN_TOKEN = 'valid-admin-token';
  const SELF_TOKEN = 'valid-self-token';

  const selfUser = {
    id: 2,
    name: 'Self User',
    email: 'self@example.com',
    role: Role.USER,
    passwordHash: 'hashed',
    photoS3Key: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    usersService = {
      findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      findOne: vi.fn().mockResolvedValue(selfUser),
      update: vi.fn().mockResolvedValue(selfUser),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      verifyAsync: vi.fn(async (token: string) => {
        if (token === ADMIN_TOKEN) {
          return { sub: 1, email: 'admin@example.com', role: Role.ADMIN };
        }
        if (token === SELF_TOKEN) {
          return { sub: 2, email: 'self@example.com', role: Role.USER };
        }
        throw new Error('invalid token');
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
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

  // Decision table: token state x role, for RolesGuard(ADMIN)-only routes.
  describe('GET /users — admin-only, full decision table', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .expect(403);
    });

    it('valid token with admin role -> 200', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
    });

    // BVA on FindUsersDto: page @Min(1), limit @Min(1)/@Max(100).
    it.each([
      ['page=1 (boundary, valid)', '?page=1', 200],
      ['page=0 (across boundary, invalid)', '?page=0', 400],
      ['limit=1 (boundary, valid)', '?limit=1', 200],
      ['limit=0 (across boundary, invalid)', '?limit=0', 400],
      ['limit=100 (boundary, valid)', '?limit=100', 200],
      ['limit=101 (across boundary, invalid)', '?limit=101', 400],
      ['invalid role enum value', '?role=superadmin', 400],
    ])('%s', async (_label, qs, expectedStatus) => {
      await request(app.getHttpServer())
        .get(`/users${qs}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(expectedStatus);
    });
  });

  // Decision table: token state x (role x id-relation), for the
  // SelfOrAdminGuard routes. This is the guard the feature introduced.
  describe('GET /users/:id — self-or-admin, full decision table', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).get('/users/2').expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .get('/users/2')
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });

    it('self token on own id -> 200', async () => {
      await request(app.getHttpServer())
        .get('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .expect(200);
    });

    it('self token on someone else\'s id -> 403', async () => {
      await request(app.getHttpServer())
        .get('/users/999')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .expect(403);
    });

    it('admin token on someone else\'s id -> 200 (admin bypass)', async () => {
      await request(app.getHttpServer())
        .get('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
    });

    it('non-numeric id -> 400 (guard passes for admin, ParseIntPipe rejects)', async () => {
      await request(app.getHttpServer())
        .get('/users/not-a-number')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(400);
    });

    it('returns 404 when the user does not exist', async () => {
      usersService.findOne.mockRejectedValue(
        new NotFoundException('User 999 not found'),
      );

      await request(app.getHttpServer())
        .get('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(404);
    });
  });

  describe('PATCH /users/:id — self-or-admin guard smoke check', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .patch('/users/2')
        .send({ name: 'New Name' })
        .expect(401);
    });

    it("self token on someone else's id -> 403", async () => {
      await request(app.getHttpServer())
        .patch('/users/999')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .send({ name: 'New Name' })
        .expect(403);
    });

    it('self token on own id -> 200', async () => {
      await request(app.getHttpServer())
        .patch('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .send({ name: 'New Name' })
        .expect(200);
    });

    it("admin token on someone else's id -> 200 (admin bypass)", async () => {
      await request(app.getHttpServer())
        .patch('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'New Name' })
        .expect(200);
    });

    it('returns 409 when the service reports a name/email conflict', async () => {
      usersService.update.mockRejectedValue(
        new ConflictException('A user with that name or email already exists'),
      );

      await request(app.getHttpServer())
        .patch('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .send({ email: 'taken@example.com' })
        .expect(409);
    });

    it('returns 404 when the user does not exist', async () => {
      usersService.update.mockRejectedValue(
        new NotFoundException('User 999 not found'),
      );

      await request(app.getHttpServer())
        .patch('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  // The security fix this feature closed: role/password must never reach
  // UsersService.update, for self OR admin callers, because UpdateUserDto
  // doesn't declare those fields and the global pipe is whitelist:true.
  describe('PATCH /users/:id — role/password stripped (privilege-escalation fix)', () => {
    it('strips role and password when the caller is the account owner', async () => {
      await request(app.getHttpServer())
        .patch('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .send({ name: 'New Name', role: 'admin', password: 'hunter2' })
        .expect(200);

      expect(usersService.update).toHaveBeenCalledWith(2, {
        name: 'New Name',
      });
    });

    it('strips role and password when the caller is an admin acting on another account', async () => {
      await request(app.getHttpServer())
        .patch('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'New Name', role: 'admin', password: 'hunter2' })
        .expect(200);

      expect(usersService.update).toHaveBeenCalledWith(999, {
        name: 'New Name',
      });
    });
  });

  describe('PATCH /users/:id — UpdateUserDto validation (BVA)', () => {
    const authedSelf = () =>
      request(app.getHttpServer())
        .patch('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`);

    it('rejects a malformed email', async () => {
      await authedSelf().send({ email: 'not-an-email' }).expect(400);
    });

    it('accepts a well-formed email', async () => {
      await authedSelf().send({ email: 'new@example.com' }).expect(200);
    });

    it('accepts photoS3Key at the 255-char boundary', async () => {
      const photoS3Key = 'a'.repeat(255);
      await authedSelf().send({ photoS3Key }).expect(200);
    });

    it('rejects photoS3Key one character past the 255-char boundary', async () => {
      const photoS3Key = 'a'.repeat(256);
      await authedSelf().send({ photoS3Key }).expect(400);
    });

    it('rejects a photoS3Key with characters outside the S3 key charset', async () => {
      await authedSelf().send({ photoS3Key: 'users/avatars/1.jpg?x=1' }).expect(400);
    });

    it('accepts an empty body (all fields optional)', async () => {
      await authedSelf().send({}).expect(200);
    });
  });

  // RolesGuard(ADMIN)-only route: distinct from GET/PATCH — a user's own id
  // must NOT be enough here, only role matters (see "fuera de alcance:
  // auto-eliminación" in specs/users-crud.md).
  describe('DELETE /users/:id — admin-only, full decision table', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer()).delete('/users/2').expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .delete('/users/2')
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });

    it('self token deleting own account -> 403 (self-deletion is out of scope)', async () => {
      await request(app.getHttpServer())
        .delete('/users/2')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .expect(403);
    });

    it('self token deleting someone else -> 403', async () => {
      await request(app.getHttpServer())
        .delete('/users/999')
        .set('Authorization', `Bearer ${SELF_TOKEN}`)
        .expect(403);
    });

    it('admin token -> 200', async () => {
      await request(app.getHttpServer())
        .delete('/users/2')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
    });

    it('returns 404 when the user does not exist', async () => {
      usersService.remove.mockRejectedValue(
        new NotFoundException('User 999 not found'),
      );

      await request(app.getHttpServer())
        .delete('/users/999')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(404);
    });
  });
});
