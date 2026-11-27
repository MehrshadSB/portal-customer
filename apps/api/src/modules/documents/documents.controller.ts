import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type ListDocumentsQueryInput,
  listDocumentsQuerySchema,
  type PresignUploadInput,
  presignUploadSchema,
} from '@portal/validators';
import {
  CurrentUser,
  ReqMeta,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.DOCUMENT_READ_PUBLIC, PERMISSIONS.DOCUMENT_READ_INTERNAL)
  @ApiOperation({ summary: 'List ready documents scoped by customer and visibility' })
  async list(
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.documentsService.list(query, actor);
    return { data: items, meta };
  }

  @Post('presign-upload')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @ApiOperation({ summary: 'Create pending attachment record and return presigned S3 PUT URL' })
  async presignUpload(
    @Body(new ZodValidationPipe(presignUploadSchema)) body: PresignUploadInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.documentsService.presignUpload(body, actor);
    return { data };
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @ApiOperation({ summary: 'Verify uploaded S3 object size and magic bytes and mark ready' })
  async completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.documentsService.completeUpload(id, actor, meta);
    return { data };
  }

  @Get(':id/download-url')
  @RequireAnyPermission(PERMISSIONS.DOCUMENT_READ_PUBLIC, PERMISSIONS.DOCUMENT_READ_INTERNAL)
  @ApiOperation({ summary: 'Generate short-lived presigned GET download URL' })
  async getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.documentsService.getDownloadUrl(id, actor);
    return { data };
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.DOCUMENT_DELETE_ALL, PERMISSIONS.DOCUMENT_DELETE_OWN)
  @ApiOperation({ summary: 'Soft-delete attachment metadata and remove S3 object' })
  async deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    await this.documentsService.deleteDocument(id, actor, meta);
    return { data: { ok: true } };
  }
}
