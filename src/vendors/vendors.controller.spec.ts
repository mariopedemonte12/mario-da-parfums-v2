import { Test, TestingModule } from '@nestjs/testing';
import { VendorsController } from './vendors.controller.js';
import { VendorsService } from './vendors.service.js';

describe('VendorsController', () => {
  let controller: VendorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [VendorsService],
    }).compile();

    controller = module.get<VendorsController>(VendorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
