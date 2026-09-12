import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_PARAM_KEY } from '../decorators/owner-param.decorator.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName =
      this.reflector.getAllAndOverride<string>(OWNER_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const resourceId = request.params[paramName];

    if (!request.user || String(request.user.sub) !== resourceId) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    return true;
  }
}
