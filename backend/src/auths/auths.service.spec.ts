import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';
import { AuthsService } from './auths.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordsService } from '../passwords/passwords.service.js';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../shared/enums/role.enums.js';
import { DRIZZLE } from '../database/database.module.js';

// Fake tx handle passed to usersService.create() inside the transaction —
// its identity is what register()'s tests assert against, its shape is
// irrelevant since UsersService itself is mocked in this file.
const FAKE_TX = { __fakeTx: true };

describe('AuthsService', () => {
  let service: AuthsService;
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let passwordsService: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  let jwtService: { sign: ReturnType<typeof vi.fn> };
  let db: { transaction: ReturnType<typeof vi.fn> };

  const sampleUser = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: Role.USER,
    passwordHash: 'hashed-password',
    photoS3Key: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersService = { findByEmail: vi.fn(), create: vi.fn() };
    passwordsService = { hash: vi.fn(), verify: vi.fn() };
    jwtService = { sign: vi.fn().mockReturnValue('signed-jwt') };
    // Mimics real drizzle transaction semantics closely enough for these
    // unit tests: runs the callback with a fake tx handle and lets a thrown
    // error propagate as a rejection, same as a real rolled-back tx would.
    db = { transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(FAKE_TX)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthsService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordsService, useValue: passwordsService },
        { provide: JwtService, useValue: jwtService },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get<AuthsService>(AuthsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('creates the user and returns an access token', async () => {
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(sampleUser);

      const result = await service.register({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Str0ng!Pass',
      });

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(usersService.create).toHaveBeenCalledWith(
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          passwordHash: 'hashed-password',
          role: Role.USER,
        },
        FAKE_TX,
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: sampleUser.id,
        email: sampleUser.email,
        role: sampleUser.role,
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: expect.objectContaining({ email: sampleUser.email }),
      });
    });

    it('rolls back (rejects, does not swallow) when JWT signing fails after the user row is inserted', async () => {
      // Regression test: user.id (the JWT's `sub`) is only known after the
      // insert, so signing can't happen before it — but a signing failure
      // (e.g. a misconfigured JWT_SECRET) must not leave the row committed
      // with the caller believing registration failed outright.
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(sampleUser);
      const signingError = new Error('secretOrPrivateKey must have a value');
      jwtService.sign.mockImplementation(() => {
        throw signingError;
      });

      await expect(
        service.register({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toBe(signingError);

      // The insert did happen (inside the transaction) — it's the
      // transaction's job to roll it back, which this unit test can't
      // observe directly against a mocked db.transaction, but it confirms
      // the error isn't swallowed and reaches the caller unchanged.
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane@example.com' }),
        FAKE_TX,
      );
    });

    it('propagates a db insert failure (e.g. a 23505 the optimistic check missed) instead of ignoring it', async () => {
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockRejectedValue({ code: '23505' });

      await expect(
        service.register({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('throws a conflict when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);

      await expect(
        service.register({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('adminCreate', () => {
    it('creates the user with the requested role and returns no accessToken', async () => {
      const adminMadeUser = { ...sampleUser, role: Role.ADMIN };
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(adminMadeUser);

      const result = await service.adminCreate({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Str0ng!Pass',
        role: Role.ADMIN,
      });

      expect(usersService.create).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        passwordHash: 'hashed-password',
        role: Role.ADMIN,
      });
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('accessToken');
      expect(result).toMatchObject({ email: 'jane@example.com' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('hashes the plain-text password server-side rather than persisting it as-is', async () => {
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(sampleUser);

      await service.adminCreate({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Str0ng!Pass',
        role: Role.USER,
      });

      expect(passwordsService.hash).toHaveBeenCalledWith('Str0ng!Pass');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );
    });

    it('throws a conflict when the email is already registered (optimistic check)', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);

      await expect(
        service.adminCreate({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'Str0ng!Pass',
          role: Role.USER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('throws a conflict on a duplicate name that only the db catches (23505)', async () => {
      // findByEmail only checks email, so a duplicate *name* with a fresh
      // email passes the optimistic check and is caught by the db instead —
      // same double-check pattern as register().
      usersService.findByEmail.mockResolvedValue(undefined);
      passwordsService.hash.mockResolvedValue('hashed-password');
      usersService.create.mockRejectedValue({ code: '23505' });

      await expect(
        service.adminCreate({
          name: 'Jane Doe',
          email: 'fresh@example.com',
          password: 'Str0ng!Pass',
          role: Role.USER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns an access token for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);
      passwordsService.verify.mockResolvedValue(true);

      const result = await service.login({
        email: 'jane@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result).toEqual({
        accessToken: 'signed-jwt',
        user: expect.objectContaining({ email: sampleUser.email }),
      });
    });

    it('throws unauthorized for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(undefined);

      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(passwordsService.verify).not.toHaveBeenCalled();
    });

    it('throws unauthorized for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);
      passwordsService.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
