import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CUSTOMER_PARAM_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import type { RequestWithAuth } from '../types/auth-context';

@Injectable()
export class CustomerScopeGuard implements CanActivate {
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
    if (!actor || actor.userType !== 'customer') {
      return true;
    }

    if (!actor.customerId) {
      throw new ForbiddenException({
        code: 'CUSTOMER_MEMBERSHIP_REQUIRED',
        message: 'Customer account is not linked to an active company',
      });
    }

    const paramKey = this.reflector.getAllAndOverride<string | undefined>(CUSTOMER_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (paramKey) {
      const targetId = req.params?.[paramKey];
      if (targetId && targetId !== 'my-company' && targetId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer organization is prohibited',
        });
      }
    }

    return true;
  }
}
