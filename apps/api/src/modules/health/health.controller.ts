import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { Public } from '../../common/decorators/auth.decorators';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { StorageService } from '../../infrastructure/storage/storage.module';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return {
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe checking PostgreSQL, Redis, and S3 bucket access' })
  async ready() {
    const checks: Record<string, 'up' | 'down'> = {
      postgres: 'down',
      redis: 'down',
      s3: 'down',
    };

    try {
      await this.db.execute(sql`SELECT 1`);
      checks.postgres = 'up';
    } catch {
      checks.postgres = 'down';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    try {
      await this.storage.checkBucketHealth();
      checks.s3 = 'up';
    } catch {
      checks.s3 = 'down';
    }

    const healthy = Object.values(checks).every((state) => state === 'up');
    if (!healthy) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCIES_UNHEALTHY',
        message: 'One or more infrastructure dependencies failed readiness check',
        details: Object.entries(checks).map(([field, state]) => ({
          field,
          message: state,
        })),
      });
    }

    return {
      data: {
        status: 'ok',
        checks,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
