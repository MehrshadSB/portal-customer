import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.schema';

export const S3_CLIENT = Symbol('S3_CLIENT');

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly nodeEnv: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    config: ConfigService<AppEnv, true>,
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    if (this.nodeEnv === 'production') return;
    await this.ensureBucketExists();
  }

  async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created S3 bucket "${this.bucket}"`);
      } catch (err) {
        this.logger.warn(`Unable to auto-create S3 bucket "${this.bucket}": ${String(err)}`);
      }
    }
  }

  async checkBucketHealth(): Promise<boolean> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return true;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => {
        return new S3Client({
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          region: config.get('S3_REGION', { infer: true }),
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
          credentials: {
            accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
            secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
          },
        });
      },
    },
    StorageService,
  ],
  exports: [S3_CLIENT, StorageService],
})
export class StorageModule {}
