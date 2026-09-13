import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { vi } from 'vitest';
import { FragrancesController } from './fragrances.controller.js';
import { FragrancesService } from './fragrances.service.js';
import { DRIZZLE } from '../database/database.module.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

describe('FragrancesController', () => {
  let controller: FragrancesController;
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
      controllers: [FragrancesController],
      providers: [
        { provide: FragrancesService, useValue: service },
        { provide: DRIZZLE, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<FragrancesController>(FragrancesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Spec (amended): reads (GET /fragrances, GET /fragrances/:id) are public;
  // batch mutations (POST/PATCH/DELETE /fragrances/batch) stay admin-only,
  // guarded per-method instead of at the controller level.
  describe('access control', () => {
    it('does not guard the controller itself', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, FragrancesController);
      const roles = Reflect.getMetadata(ROLES_KEY, FragrancesController);
      expect(guards).toBeUndefined();
      expect(roles).toBeUndefined();
    });

    it.each(['findAll', 'findOne'] as const)(
      'leaves %s without guards/roles (public read)',
      (method) => {
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          FragrancesController.prototype[method],
        );
        const roles = Reflect.getMetadata(
          ROLES_KEY,
          FragrancesController.prototype[method],
        );
        expect(guards).toBeUndefined();
        expect(roles).toBeUndefined();
      },
    );

    it.each(['createBatch', 'updateBatch', 'removeBatch'] as const)(
      'guards %s with JwtAuthGuard, RolesGuard and Role.ADMIN',
      (method) => {
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          FragrancesController.prototype[method],
        );
        const roles = Reflect.getMetadata(
          ROLES_KEY,
          FragrancesController.prototype[method],
        );
        expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
        expect(roles).toEqual([Role.ADMIN]);
      },
    );
  });

  describe('delegation to FragrancesService', () => {
    it('findAll delegates to service.findAll with the query', async () => {
      service.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      const query = { page: 1, limit: 20 };

      await controller.findAll(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('findOne delegates to service.findOne with the id', async () => {
      service.findOne.mockResolvedValue({ id: 'abc' });

      await controller.findOne('abc');

      expect(service.findOne).toHaveBeenCalledWith('abc');
    });

    it('createBatch delegates to service.createMany with dto.items', async () => {
      service.createMany.mockResolvedValue([{ success: true, id: 'abc' }]);
      const items = [{ name: 'Bleu de Chanel', brand: 'Chanel' }];

      await controller.createBatch({ items } as any);

      expect(service.createMany).toHaveBeenCalledWith(items);
    });

    it('updateBatch delegates to service.updateMany with dto.items', async () => {
      service.updateMany.mockResolvedValue([{ id: 'abc', success: true }]);
      const items = [{ id: 'abc', name: 'New Name' }];

      await controller.updateBatch({ items } as any);

      expect(service.updateMany).toHaveBeenCalledWith(items);
    });

    it('removeBatch delegates to service.removeMany with dto.ids', async () => {
      service.removeMany.mockResolvedValue([{ id: 'abc', success: true }]);
      const ids = ['abc'];

      await controller.removeBatch({ ids } as any);

      expect(service.removeMany).toHaveBeenCalledWith(ids);
    });
  });
});
