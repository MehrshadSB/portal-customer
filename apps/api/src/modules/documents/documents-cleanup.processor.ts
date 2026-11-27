import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DocumentsService } from './documents.service';

export const DOCUMENTS_CLEANUP_QUEUE = 'documents-cleanup';

@Injectable()
@Processor(DOCUMENTS_CLEANUP_QUEUE)
export class DocumentsCleanupProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DocumentsCleanupProcessor.name);
  private readonly isTest: boolean;

  constructor(
    @InjectQueue(DOCUMENTS_CLEANUP_QUEUE) private readonly queue: Queue,
    private readonly documentsService: DocumentsService,
    config: ConfigService<AppEnv, true>,
  ) {
    super();
    this.isTest = config.get('NODE_ENV', { infer: true }) === 'test';
  }

  async onModuleInit(): Promise<void> {
    if (this.isTest) return;
    await this.queue.add(
      'orphan-cleanup',
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'documents-orphan-cleanup-hourly',
        removeOnComplete: true,
      },
    );
  }

  async process(_job: Job): Promise<void> {
    const cleaned = await this.documentsService.cleanupExpiredPendingUploads(120);
    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired pending upload(s)`);
    }
  }
}
