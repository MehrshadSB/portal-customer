import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppSurface, PermissionKey } from '@portal/types';
import type { AuthenticatedActor, RequestMetadata, RequestWithAuth } from '../types/auth-context';

export const IS_PUBLIC_KEY = 'isPublic';
export const SKIP_CSRF_KEY = 'skipCsrf';
export const ALLOWED_SURFACES_KEY = 'allowedSurfaces';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const REQUIRED_ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';
export const CUSTOMER_PARAM_KEY = 'enforceCustomerParam';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
export const AllowedSurfaces = (...surfaces: AppSurface[]) =>
  SetMetadata(ALLOWED_SURFACES_KEY, surfaces);
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
export const EnforceCustomerParam = (paramName = 'id') =>
  SetMetadata(CUSTOMER_PARAM_KEY, paramName);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedActor => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    if (!req.user) {
      throw new Error('CurrentUser accessed without authenticated actor');
    }
    return req.user;
  },
);

export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMetadata => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? (forwarded.split(',')[0]?.trim() ?? req.ip ?? null)
        : (req.ip ?? null);
    return {
      ipAddress: ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      requestId: req.requestId ?? null,
    };
  },
);
