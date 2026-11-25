import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MAIL_QUEUE_NAME, MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE_NAME })],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
