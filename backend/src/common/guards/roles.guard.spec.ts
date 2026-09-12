import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import { Role } from '../../shared/enums/role.enums.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

function createContext(user?: Partial<AuthenticatedRequest['user']>) {
  const request = { user } as AuthenticatedRequest;
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  // Decision table: [requiredRoles metadata] x [request.user.role]
  it('allows the request when no @Roles metadata is set (undefined)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext({ role: Role.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when @Roles metadata is an empty array', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createContext({ role: Role.USER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when the user role is in the required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createContext({ role: Role.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the user role is not in the required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createContext({ role: Role.USER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when roles are required but request.user is missing', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('checks both handler and class metadata via getAllAndOverride', () => {
    const spy = vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const context = createContext({ role: Role.USER });
    const handler = context.getHandler();
    const klass = context.getClass();

    guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith('roles', [handler, klass]);
  });
});
