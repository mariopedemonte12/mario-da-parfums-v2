import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { ResourceOwnerGuard } from './resource-owner.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

function createContext(
  user: AuthenticatedRequest['user'] | undefined,
  params: Record<string, string>,
) {
  const request = { user, params } as AuthenticatedRequest;
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ResourceOwnerGuard', () => {
  let reflector: Reflector;
  let guard: ResourceOwnerGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
    guard = new ResourceOwnerGuard(reflector);
  });

  it('defaults the owner param name to "id" when no @OwnerParam metadata is set', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(
      { sub: 42, email: 'a@b.com', role: 'user' as any },
      { id: '42' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('uses the configured @OwnerParam name instead of "id"', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('userId');
    const context = createContext(
      { sub: 7, email: 'a@b.com', role: 'user' as any },
      { userId: '7', id: '999' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when request.user.sub matches the route param (string-coerced)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(
      { sub: 42, email: 'a@b.com', role: 'user' as any },
      { id: '42' },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the route param belongs to a different user', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(
      { sub: 42, email: 'a@b.com', role: 'user' as any },
      { id: '43' },
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when request.user is missing (unauthenticated)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(undefined, { id: '42' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the route param is missing entirely', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(
      { sub: 42, email: 'a@b.com', role: 'user' as any },
      {},
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
