import { Test, TestingModule } from '@nestjs/testing';
import { FragrancesService } from './fragrances.service.js';
import { DRIZZLE } from '../database/database.module.js';

describe('FragrancesService', () => {
  let service: FragrancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FragrancesService, { provide: DRIZZLE, useValue: {} }],
    }).compile();

    service = module.get<FragrancesService>(FragrancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
