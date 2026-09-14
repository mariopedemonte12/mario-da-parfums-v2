import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { JwtAuthGuard, AuthenticatedRequest } from './jwt-auth.guard.js';

function createContext(
  authorization?: string,
  cookies?: Record<string, string>,
) {
  const request = {
    headers: authorization ? { authorization } : {},
    cookies,
  } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let jwtService: JwtService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwtService = { verifyAsync: vi.fn() } as unknown as JwtService;
    guard = new JwtAuthGuard(jwtService);
  });

  it('allows the request and attaches the decoded payload when the token is valid', async () => {
    const payload = { sub: 1, email: 'a@b.com', role: 'user' };
    vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue(payload);
    const context = createContext('Bearer valid.token.here');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    expect(request.user).toEqual(payload);
  });

  it('throws UnauthorizedException when the Authorization header is missing', async () => {
    const context = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // Decision: header present but wrong scheme (not "Bearer") -> no token extracted
  it('throws UnauthorizedException when the scheme is not "Bearer"', async () => {
    const context = createContext('Basic dXNlcjpwYXNz');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when "Bearer" has no token after it', async () => {
    const context = createContext('Bearer');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when jwtService.verifyAsync rejects (invalid/expired token)', async () => {
    vi.spyOn(jwtService, 'verifyAsync').mockRejectedValue(
      new Error('jwt expired'),
    );
    const context = createContext('Bearer expired.token.here');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('falls back to the session cookie when there is no Authorization header', async () => {
    const payload = { sub: 1, email: 'a@b.com', role: 'user' };
    vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue(payload);
    const context = createContext(undefined, { session: 'valid.token.here' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    expect(request.user).toEqual(payload);
  });

  it('prefers the Authorization header over the cookie when both are present', async () => {
    vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue({
      sub: 1,
      email: 'a@b.com',
      role: 'user',
    });
    const context = createContext('Bearer header.token', {
      session: 'cookie.token',
    });

    await guard.canActivate(context);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header.token');
  });

  it('throws UnauthorizedException when neither header nor cookie carry a token', async () => {
    const context = createContext(undefined, {});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not leak the underlying jwt library error message', async () => {
    vi.spyOn(jwtService, 'verifyAsync').mockRejectedValue(
      new Error('secret key mismatch: xyz'),
    );
    const context = createContext('Bearer bad.token.here');

    try {
      await guard.canActivate(context);
      expect.unreachable('canActivate should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as Error).message).not.toContain('secret key mismatch');
    }
  });
});
