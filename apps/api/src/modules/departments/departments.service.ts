import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DepartmentDto } from '@portal/types';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@portal/validators';
import { asc, eq } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { departments } from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  private toDto(row: typeof departments.$inferSelect): DepartmentDto {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      leadEmployeeId: row.leadEmployeeId,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(): Promise<DepartmentDto[]> {
    const rows = await this.db.select().from(departments).orderBy(asc(departments.name));
    return rows.map((r) => this.toDto(r));
  }

  async create(
    dto: CreateDepartmentInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<DepartmentDto> {
    const [created] = await this.db
      .transaction(async (tx) => {
        try {
          const [row] = await tx
            .insert(departments)
            .values({
              name: dto.name,
              code: dto.code,
              description: dto.description ?? null,
              leadEmployeeId: dto.leadEmployeeId ?? null,
            })
            .returning();

          if (row) {
            await this.auditService.record(
              {
                actorUserId: actor.id,
                actorType: 'employee',
                action: 'department.created',
                entityType: 'department',
                entityId: row.id,
                summary: `Created department ${row.code} (${row.name})`,
                afterJson: row,
                meta,
              },
              tx,
            );
          }

          return [row];
        } catch (err: unknown) {
          if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
            throw new ConflictException({
              code: 'DEPARTMENT_EXISTS',
              message: 'A department with that name or code already exists',
            });
          }
          throw err;
        }
      });

    if (!created) throw new Error('Failed to create department');
    return this.toDto(created);
  }

  async update(
    id: string,
    dto: UpdateDepartmentInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<DepartmentDto> {
    const [existing] = await this.db.select().from(departments).where(eq(departments.id, id));
    if (!existing) {
      throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' });
    }

    const [updated] = await this.db.transaction(async (tx) => {
      try {
        const [row] = await tx
          .update(departments)
          .set({
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.code !== undefined ? { code: dto.code } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.leadEmployeeId !== undefined ? { leadEmployeeId: dto.leadEmployeeId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            updatedAt: new Date(),
          })
          .where(eq(departments.id, id))
          .returning();

        if (row) {
          await this.auditService.record(
            {
              actorUserId: actor.id,
              actorType: 'employee',
              action: 'department.updated',
              entityType: 'department',
              entityId: id,
              summary: `Updated department ${row.code}`,
              beforeJson: existing,
              afterJson: row,
              meta,
            },
            tx,
          );
        }

        return [row];
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
          throw new ConflictException({
            code: 'DEPARTMENT_EXISTS',
            message: 'A department with that name or code already exists',
          });
        }
        throw err;
      }
    });

    if (!updated) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' });
    return this.toDto(updated);
  }
}
