import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogDto, PaginationMeta } from '@portal/types';
import type { ListAuditLogsQueryInput } from '@portal/validators';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { auditLogs, users } from '../../infrastructure/database/schema';

export interface RecordAuditEntry {
  actorUserId?: string | null;
  actorType: 'employee' | 'customer' | 'system';
  action: string;
  entityType: string;
  entityId?: string | null;
  customerId?: string | null;
  summary: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  meta?: RequestMetadata;
}

const SENSITIVE_KEYS = new Set(['password', 'passwordhash', 'token', 'tokenhash', 'secret']);

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSensitive(val);
      }
    }
    return out;
  }
  return value;
}

type DbExecutor = Pick<DrizzleDb, 'insert'>;

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async record(entry: RecordAuditEntry, executor: DbExecutor = this.db): Promise<void> {
    await executor.insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      customerId: entry.customerId ?? null,
      summary: entry.summary,
      beforeJson: entry.beforeJson !== undefined ? redactSensitive(entry.beforeJson) : null,
      afterJson: entry.afterJson !== undefined ? redactSensitive(entry.afterJson) : null,
      ipAddress: entry.meta?.ipAddress ?? null,
      userAgent: entry.meta?.userAgent ?? null,
      requestId: entry.meta?.requestId ?? null,
    });
  }

  async list(
    query: ListAuditLogsQueryInput,
  ): Promise<{ items: AuditLogDto[]; meta: PaginationMeta }> {
    const conditions = [];
    if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
    if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
    if (query.customerId) conditions.push(eq(auditLogs.customerId, query.customerId));
    if (query.actorUserId) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(sql`(${auditLogs.summary} ILIKE ${pattern} OR ${auditLogs.action} ILIKE ${pattern})`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorName: users.fullName,
        actorEmail: users.email,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        customerId: auditLogs.customerId,
        summary: auditLogs.summary,
        beforeJson: auditLogs.beforeJson,
        afterJson: auditLogs.afterJson,
        ipAddress: auditLogs.ipAddress,
        requestId: auditLogs.requestId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map((row) => ({
        ...row,
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
}
