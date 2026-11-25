import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppSurface, PermissionKey } from '@portal/types';
import {
  ALLOWED_SURFACES_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../decorators/auth.decorators';
import type { RequestWithAuth } from '../types/auth-context';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const actor = req.user;
    if (!actor) return false;

    const allowedSurfaces = this.reflector.getAllAndOverride<AppSurface[] | undefined>(
      ALLOWED_SURFACES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowedSurfaces && allowedSurfaces.length > 0 && !allowedSurfaces.includes(actor.surface)) {
      throw new ForbiddenException({
        code: 'SURFACE_FORBIDDEN',
        message: 'This resource is not available on the current application surface',
      });
    }

    const requiredAll = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      REQUIRED_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const granted = new Set(actor.permissions);

    if (requiredAll && requiredAll.length > 0) {
      const missing = requiredAll.filter((perm) => !granted.has(perm));
      if (missing.length > 0) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions for this operation',
        });
      }
    }

    if (requiredAny && requiredAny.length > 0) {
      const hasOne = requiredAny.some((perm) => granted.has(perm));
      if (!hasOne) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions for this operation',
        });
      }
    }

    return true;
  }
}
