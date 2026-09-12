import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { DRIZZLE } from '../database/database.module.js';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: DRIZZLE, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
