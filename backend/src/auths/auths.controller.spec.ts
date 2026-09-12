import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { AuthsController } from './auths.controller.js';
import { AuthsService } from './auths.service.js';

describe('AuthsController', () => {
  let controller: AuthsController;
  let authsService: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authsService = { register: vi.fn(), login: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthsController],
      providers: [{ provide: AuthsService, useValue: authsService }],
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
});
