import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthsController } from './auths.controller.js';
import { AuthsService } from './auths.service.js';
import { Role } from '../shared/enums/role.enums.js';
import { customValidationPipe } from '../pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter.js';

describe('AuthsController', () => {
  let controller: AuthsController;
  let authsService: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    adminCreate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authsService = {
      register: vi.fn(),
      login: vi.fn(),
      adminCreate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthsController],
      providers: [
        { provide: AuthsService, useValue: authsService },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthsController>(AuthsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('register delegates to AuthsService.register', async () => {
    const dto = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Str0ng!Pass',
    };
    authsService.register.mockResolvedValue({ accessToken: 'token' });

    const result = await controller.register(dto);

    expect(authsService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'token' });
  });

  it('login delegates to AuthsService.login', async () => {
    const dto = { email: 'jane@example.com', password: 'Str0ng!Pass' };
    authsService.login.mockResolvedValue({ accessToken: 'token' });

    const result = await controller.login(dto);

    expect(authsService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'token' });
  });

  it('adminRegister delegates to AuthsService.adminCreate', async () => {
    const dto = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Str0ng!Pass',
      role: Role.ADMIN,
    };
    authsService.adminCreate.mockResolvedValue({ id: 1, email: dto.email });

    const result = await controller.adminRegister(dto);

    expect(authsService.adminCreate).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 1, email: dto.email });
  });
});

// POST /auths/admin-register is the only path that can create an admin
// account, so its guard (JwtAuthGuard + RolesGuard(ADMIN)) is exercised for
// real here rather than only asserting delegation against a mocked service —
// same rationale as the HTTP block in users.controller.spec.ts and
// vendors.controller.spec.ts.
describe('AuthsController (HTTP, real guards + validation pipe)', () => {
  let app: INestApplication<App>;
  let authsService: { adminCreate: ReturnType<typeof vi.fn> };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  const ADMIN_TOKEN = 'valid-admin-token';
  const USER_TOKEN = 'valid-user-token';

  const validBody = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Str0ng!Pass',
    role: Role.USER,
  };

  beforeEach(async () => {
    authsService = {
      adminCreate: vi.fn().mockResolvedValue({ id: 1, email: validBody.email }),
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
      controllers: [AuthsController],
      providers: [
        { provide: AuthsService, useValue: authsService },
        { provide: JwtService, useValue: jwtService },
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

  describe('POST /auths/admin-register — admin-only, full decision table', () => {
    it('no Authorization header -> 401', async () => {
      await request(app.getHttpServer())
        .post('/auths/admin-register')
        .send(validBody)
        .expect(401);
    });

    it('invalid/expired token -> 401', async () => {
      await request(app.getHttpServer())
        .post('/auths/admin-register')
        .set('Authorization', 'Bearer garbage-token')
        .send(validBody)
        .expect(401);
    });

    it('valid token but non-admin role -> 403', async () => {
      await request(app.getHttpServer())
        .post('/auths/admin-register')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(validBody)
        .expect(403);
    });

    it('valid token with admin role -> 201', async () => {
      await request(app.getHttpServer())
        .post('/auths/admin-register')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(validBody)
        .expect(201);
    });

    it('an admin can create another admin (role: admin is accepted)', async () => {
      await request(app.getHttpServer())
        .post('/auths/admin-register')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ ...validBody, role: Role.ADMIN })
        .expect(201);

      expect(authsService.adminCreate).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.ADMIN }),
      );
    });
  });

  describe('POST /auths/admin-register — AdminCreateUserDto validation', () => {
    const authed = () =>
      request(app.getHttpServer())
        .post('/auths/admin-register')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    it('rejects a missing role', async () => {
      const { role: _role, ...rest } = validBody;
      await authed().send(rest).expect(400);
    });

    it('rejects a weak password', async () => {
      await authed()
        .send({ ...validBody, password: 'weak' })
        .expect(400);
    });

    it('rejects a malformed email', async () => {
      await authed()
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });
  });
});
