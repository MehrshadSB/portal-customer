import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { AppEnv } from './infrastructure/config/env.schema';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });
  const portalUrl = config.get('PORTAL_URL', { infer: true });
  const adminUrl = config.get('ADMIN_URL', { infer: true });
  const redisUrl = config.get('REDIS_URL', { infer: true });
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redisUrl);
  app.useWebSocketAdapter(redisIoAdapter);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [portalUrl, adminUrl],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-App-Surface', 'X-Request-Id'],
  });

  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Customer, Order Tracking & Support Platform API')
      .setDescription('REST & Realtime API for Customer Portal and Admin Operations Dashboard')
      .setVersion('1.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  logger.log(`API server listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
