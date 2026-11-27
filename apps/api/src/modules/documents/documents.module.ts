import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DOCUMENTS_CLEANUP_QUEUE, DocumentsCleanupProcessor } from './documents-cleanup.processor';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_CLEANUP_QUEUE })],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsCleanupProcessor],
  exports: [DocumentsService],
})
export class DocumentsModule {}
