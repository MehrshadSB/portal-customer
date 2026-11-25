import { Inject, Injectable } from '@nestjs/common';
import { resolveLocale } from '@portal/i18n';
import type { AppSurface } from '@portal/types';
import { and, eq, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import {
  type AuthenticatedActor,
  expectedUserTypeForSurface,
} from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { users } from '../../infrastructure/database/schema';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RbacService } from '../rbac/rbac.service';

const AUTH_STATE_TTL_SECONDS = 60;

@Injectable()
export class AuthStateService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rbacService: RbacService,
  ) {}

  private cacheKey(userId: string, surface: AppSurface): string {
    return `auth:user_state:${surface}:${userId}`;
  }

  async getActiveActor(userId: string, surface: AppSurface): Promise<AuthenticatedActor | null> {
    const key = this.cacheKey(userId, surface);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as AuthenticatedActor;
    }

    const expectedType = expectedUserTypeForSurface(surface);
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    if (!user || user.status !== 'active' || user.userType !== expectedType) {
      return null;
    }

    const ctx = await this.rbacService.resolveUserContext(user.id, user.userType);
    if (user.userType === 'customer' && !ctx.customerId) {
      return null;
    }

    const actor: AuthenticatedActor = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      timezone: user.timezone,
      locale: resolveLocale(user.locale),
      userType: user.userType,
      status: user.status,
      surface,
      customerId: ctx.customerId,
      customerName: ctx.customerName,
      employeeId: ctx.employeeId,
      departmentId: ctx.departmentId,
      roles: ctx.roles,
      permissions: ctx.permissions,
      tokenVersion: user.tokenVersion,
    };

    await this.redis.set(key, JSON.stringify(actor), 'EX', AUTH_STATE_TTL_SECONDS);
    return actor;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(userId, 'portal'), this.cacheKey(userId, 'admin'));
  }

  async invalidateUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const keys = userIds.flatMap((id) => [this.cacheKey(id, 'portal'), this.cacheKey(id, 'admin')]);
    await this.redis.del(...keys);
  }
}
