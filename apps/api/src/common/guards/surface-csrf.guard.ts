import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { APP_SURFACES, type AppSurface } from '@portal/types';
import { timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { IS_PUBLIC_KEY, SKIP_CSRF_KEY } from '../decorators/auth.decorators';
import type { RequestWithAuth } from '../types/auth-context';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SurfaceCsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<AppEnv, true>,
  ) {
    this.allowedOrigins = new Set([
      config.get('PORTAL_URL', { infer: true }),
      config.get('ADMIN_URL', { infer: true }),
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const surface = this.resolveSurface(req);
    if (surface) {
      req.appSurface = surface;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!surface && !isPublic) {
      throw new BadRequestException({
        code: 'MISSING_APP_SURFACE',
        message: 'Valid X-App-Surface header (portal or admin) is required',
      });
    }

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      this.verifyOriginIfPresent(req);
      return true;
    }

    if (!surface) {
      throw new ForbiddenException({
        code: 'CSRF_SURFACE_REQUIRED',
        message: 'CSRF verification requires a valid application surface',
      });
    }

    const cookieToken = req.cookies?.[`${surface}_csrf_token`];
    const headerToken = req.headers['x-csrf-token'];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length < 16 ||
      cookieToken.length !== headerToken.length
    ) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'Missing or invalid CSRF token',
      });
    }

    const valid = timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
    if (!valid) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'CSRF token mismatch',
      });
    }

    return true;
  }

  private resolveSurface(req: RequestWithAuth): AppSurface | undefined {
    const paramSurface = req.params?.surface;
    if (typeof paramSurface === 'string' && APP_SURFACES.includes(paramSurface as AppSurface)) {
      return paramSurface as AppSurface;
    }

    const headerSurface = req.headers['x-app-surface'];
    if (typeof headerSurface === 'string' && APP_SURFACES.includes(headerSurface as AppSurface)) {
      return headerSurface as AppSurface;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      if (origin.includes(':3000') || origin.includes('portal.')) return 'portal';
      if (origin.includes(':3001') || origin.includes('admin.')) return 'admin';
    }

    return undefined;
  }

  private verifyOriginIfPresent(req: RequestWithAuth): void {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Request origin is not permitted',
      });
    }
  }
}
