import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveLocale } from '@portal/i18n';
import type {
  AppSurface,
  NotificationDto,
  NotificationPreferenceDto,
  PaginationMeta,
} from '@portal/types';
import type {
  ListNotificationsQueryInput,
  UpdateNotificationPreferenceInput,
} from '@portal/validators';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthenticatedActor } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  customerMembers,
  employees,
  notificationPreferences,
  notifications,
  users,
} from '../../infrastructure/database/schema';
import { MailService } from '../../infrastructure/mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface DispatchNotificationParams {
  recipientUserIds: string[];
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  surface: AppSurface;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly realtimeService: RealtimeService,
    private readonly mailService: MailService,
  ) {}

  async list(
    query: ListNotificationsQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: NotificationDto[]; meta: PaginationMeta }> {
    const conditions = [eq(notifications.recipientUserId, actor.id)];
    if (query.unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map((row) => ({
        ...row,
        readAt: row.readAt ? row.readAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async unreadCount(actor: AuthenticatedActor): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, actor.id), eq(notifications.isRead, false)));
    return row?.total ?? 0;
  }

  async markRead(id: string, actor: AuthenticatedActor): Promise<NotificationDto> {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, actor.id)))
      .returning();

    if (!updated) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found',
      });
    }

    return {
      ...updated,
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async markAllRead(actor: AuthenticatedActor): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.recipientUserId, actor.id), eq(notifications.isRead, false)));
  }

  async getPreferences(actor: AuthenticatedActor): Promise<NotificationPreferenceDto[]> {
    return this.db
      .select({
        id: notificationPreferences.id,
        eventType: notificationPreferences.eventType,
        inAppEnabled: notificationPreferences.inAppEnabled,
        emailEnabled: notificationPreferences.emailEnabled,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, actor.id));
  }

  async updatePreference(
    dto: UpdateNotificationPreferenceInput,
    actor: AuthenticatedActor,
  ): Promise<NotificationPreferenceDto> {
    const [existing] = await this.db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, actor.id),
          eq(notificationPreferences.eventType, dto.eventType),
        ),
      );

    if (existing) {
      const [updated] = await this.db
        .update(notificationPreferences)
        .set({
          inAppEnabled: dto.inAppEnabled,
          emailEnabled: dto.emailEnabled,
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();
      return {
        id: updated!.id,
        eventType: updated!.eventType,
        inAppEnabled: updated!.inAppEnabled,
        emailEnabled: updated!.emailEnabled,
      };
    }

    const [created] = await this.db
      .insert(notificationPreferences)
      .values({
        userId: actor.id,
        eventType: dto.eventType,
        inAppEnabled: dto.inAppEnabled,
        emailEnabled: dto.emailEnabled,
      })
      .returning();
    return {
      id: created!.id,
      eventType: created!.eventType,
      inAppEnabled: created!.inAppEnabled,
      emailEnabled: created!.emailEnabled,
    };
  }

  async getCustomerUserIds(customerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: customerMembers.userId })
      .from(customerMembers)
      .innerJoin(users, eq(customerMembers.userId, users.id))
      .where(
        and(
          eq(customerMembers.customerId, customerId),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
        ),
      );
    return rows.map((r) => r.userId);
  }

  async getStaffUserIds(opts: {
    employeeId?: string | null;
    departmentId?: string | null;
    excludeUserId?: string;
  }): Promise<string[]> {
    const ids = new Set<string>();
    if (opts.employeeId) {
      const [emp] = await this.db
        .select({ userId: employees.userId })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(employees.id, opts.employeeId),
            eq(employees.isActive, true),
            eq(users.status, 'active'),
            isNull(users.deletedAt),
          ),
        );
      if (emp) ids.add(emp.userId);
    } else if (opts.departmentId) {
      const deptEmps = await this.db
        .select({ userId: employees.userId })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(employees.departmentId, opts.departmentId),
            eq(employees.isActive, true),
            eq(users.status, 'active'),
            isNull(users.deletedAt),
          ),
        );
      for (const e of deptEmps) ids.add(e.userId);
    }

    if (opts.excludeUserId) {
      ids.delete(opts.excludeUserId);
    }
    return [...ids];
  }

  async dispatch(params: DispatchNotificationParams): Promise<void> {
    const uniqueIds = [...new Set(params.recipientUserIds)].filter(Boolean);
    if (uniqueIds.length === 0) return;

    const targetType = params.surface === 'portal' ? 'customer' : 'employee';
    const recipientUsers = await this.db
      .select()
      .from(users)
      .where(
        and(
          inArray(users.id, uniqueIds),
          eq(users.userType, targetType),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
        ),
      );
    if (recipientUsers.length === 0) return;

    const prefRows = await this.db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          inArray(
            notificationPreferences.userId,
            recipientUsers.map((u) => u.id),
          ),
          eq(notificationPreferences.eventType, params.type),
        ),
      );
    const prefByUser = new Map(prefRows.map((p) => [p.userId, p]));

    for (const user of recipientUsers) {
      const pref = prefByUser.get(user.id);
      const inAppEnabled = pref ? pref.inAppEnabled : true;
      const emailEnabled = pref ? pref.emailEnabled : true;

      if (inAppEnabled) {
        const [inserted] = await this.db
          .insert(notifications)
          .values({
            recipientUserId: user.id,
            type: params.type,
            title: params.title,
            body: params.body,
            entityType: params.entityType ?? null,
            entityId: params.entityId ?? null,
            actionUrl: params.actionUrl ?? null,
          })
          .returning();

        if (inserted) {
          this.realtimeService.emitNotification(params.surface, user.id, {
            id: inserted.id,
            type: inserted.type,
            title: inserted.title,
            body: inserted.body,
            entityType: inserted.entityType,
            entityId: inserted.entityId,
            actionUrl: inserted.actionUrl,
            createdAt: inserted.createdAt.toISOString(),
          });
        }
      }

      if (emailEnabled && user.email) {
        await this.mailService.enqueueNotification({
          to: user.email,
          fullName: user.fullName,
          surface: params.surface,
          title: params.title,
          body: params.body,
          actionPath: params.actionUrl,
          locale: resolveLocale(user.locale),
        });
      }
    }
  }
}
