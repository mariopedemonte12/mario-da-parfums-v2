import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';
import { AuthsService } from './auths.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordsService } from '../passwords/passwords.service.js';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../shared/enums/role.enums.js';

describe('AuthsService', () => {
  let service: AuthsService;
  let usersService: { findByEmail: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let passwordsService: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let jwtService: { sign: ReturnType<typeof vi.fn> };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthsService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordsService, useValue: passwordsService },
        { provide: JwtService, useValue: jwtService },
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

      const result = await service.register({ name: 'Jane Doe', email: 'jane@example.com', password: 'Str0ng!Pass' });

      expect(usersService.create).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        passwordHash: 'hashed-password',
        role: Role.USER,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: sampleUser.id, email: sampleUser.email, role: sampleUser.role });
      expect(result).toEqual({ accessToken: 'signed-jwt', user: expect.objectContaining({ email: sampleUser.email }) });
    });

    it('throws a conflict when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);

      await expect(
        service.register({ name: 'Jane Doe', email: 'jane@example.com', password: 'Str0ng!Pass' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns an access token for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);
      passwordsService.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'jane@example.com', password: 'Str0ng!Pass' });

      expect(result).toEqual({ accessToken: 'signed-jwt', user: expect.objectContaining({ email: sampleUser.email }) });
    });

    it('throws unauthorized for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(undefined);

      await expect(service.login({ email: 'missing@example.com', password: 'whatever' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(passwordsService.verify).not.toHaveBeenCalled();
    });

    it('throws unauthorized for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(sampleUser);
      passwordsService.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'jane@example.com', password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
