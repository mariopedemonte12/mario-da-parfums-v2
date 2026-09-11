import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { UsersService } from './users.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { Role } from '../shared/enums/role.enums.js';

describe('UsersService', () => {
  let service: UsersService;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  const sampleUser = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: Role.USER,
    passwordHash: 'hashed',
    photoS3Key: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([sampleUser]),
          }),
        }),
      });

      const result = await service.findByEmail('jane@example.com');

      expect(result).toEqual(sampleUser);
    });

    it('returns undefined when no user matches', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('inserts the user and returns the inserted row', async () => {
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([sampleUser]),
        }),
      });

      const result = await service.create({
        name: sampleUser.name,
        email: sampleUser.email,
        passwordHash: sampleUser.passwordHash,
        role: Role.USER,
      });

      expect(result).toEqual(sampleUser);
    });
  });
});
