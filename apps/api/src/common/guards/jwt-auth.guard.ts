import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AppSurface, UserType } from '@portal/types';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { AuthStateService } from '../../modules/auth/auth-state.service';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { expectedUserTypeForSurface, type RequestWithAuth } from '../types/auth-context';

export interface AccessJwtPayload {
  sub: string;
  aud: AppSurface;
  userType: UserType;
  tokenVersion: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authStateService: AuthStateService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const surface = req.appSurface;
    if (!surface) {
      throw new UnauthorizedException({
        code: 'SURFACE_REQUIRED',
        message: 'Application surface header is required',
      });
    }

    const token = req.cookies?.[`${surface}_access_token`];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    let payload: AccessJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessJwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Session token is invalid or expired',
      });
    }

    if (payload.aud !== surface || payload.userType !== expectedUserTypeForSurface(surface)) {
      throw new ForbiddenException({
        code: 'SURFACE_TOKEN_MISMATCH',
        message: 'Token does not belong to this application surface',
      });
    }

    const actor = await this.authStateService.getActiveActor(payload.sub, surface);
    if (!actor || actor.status !== 'active' || actor.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session has been invalidated',
      });
    }

    req.user = actor;
    return true;
  }
}
