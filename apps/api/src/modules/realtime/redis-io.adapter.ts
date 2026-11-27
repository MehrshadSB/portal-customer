import { type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import type { AppEnv } from '../../infrastructure/config/env.schema';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private readonly allowedOrigins: string[];

  constructor(app: INestApplicationContext) {
    super(app);
    const config = app.get<ConfigService<AppEnv, true>>(ConfigService);
    this.allowedOrigins = [
      config.get('PORTAL_URL', { infer: true }),
      config.get('ADMIN_URL', { infer: true }),
    ];
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    this.pubClient = new Redis(redisUrl);
    this.subClient = this.pubClient.duplicate();
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.allowedOrigins,
        credentials: true,
      },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async close(server: Parameters<IoAdapter['close']>[0]): Promise<void> {
    await super.close(server);
    if (this.subClient) await this.subClient.quit();
    if (this.pubClient) await this.pubClient.quit();
  }
}
