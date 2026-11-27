import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeAuthHelper } from './realtime-auth.helper';
import { AdminRealtimeGateway, PortalRealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule],
  providers: [RealtimeService, RealtimeAuthHelper, PortalRealtimeGateway, AdminRealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
