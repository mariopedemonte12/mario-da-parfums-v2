import { Test, TestingModule } from '@nestjs/testing';
import { FragrancesService } from './fragrances.service.js';

describe('FragrancesService', () => {
  let service: FragrancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FragrancesService],
    }).compile();

    service = module.get<FragrancesService>(FragrancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
