import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import { type ListAuditLogsQueryInput, listAuditLogsQuerySchema } from '@portal/validators';
import { AllowedSurfaces, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.AUDIT_LOG_READ)
  @ApiOperation({ summary: 'Query paginated system audit logs' })
  async list(
    @Query(new ZodValidationPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQueryInput,
  ) {
    const { items, meta } = await this.auditService.list(query);
    return { data: items, meta };
  }
}
