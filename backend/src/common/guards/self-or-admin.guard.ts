import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_PARAM_KEY } from '../decorators/owner-param.decorator.js';
import { Role } from '../../shared/enums/role.enums.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

// Allows the resource owner OR an admin — RolesGuard and ResourceOwnerGuard
// alone can't express this because Nest evaluates multiple guards with AND.
@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.role === Role.ADMIN) {
      return true;
    }

    const paramName =
      this.reflector.getAllAndOverride<string>(OWNER_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    const resourceId = request.params[paramName];

    if (!request.user || String(request.user.sub) !== resourceId) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    return true;
  }
}
