import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FragrancesController } from './fragrances.controller.js';
import { FragrancesService } from './fragrances.service.js';
import { DRIZZLE } from '../database/database.module.js';

describe('FragrancesController', () => {
  let controller: FragrancesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FragrancesController],
      providers: [
        FragrancesService,
        { provide: DRIZZLE, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<FragrancesController>(FragrancesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
