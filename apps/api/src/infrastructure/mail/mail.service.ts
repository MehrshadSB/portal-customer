import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  type InviteMailJob,
  MAIL_QUEUE_NAME,
  type MailJobPayload,
  type PasswordResetMailJob,
} from './mail.processor';

@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue<MailJobPayload>) {}

  async enqueueInvite(payload: Omit<InviteMailJob, 'kind'>): Promise<void> {
    await this.mailQueue.add(
      'invite',
      { kind: 'invite', ...payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
    );
  }

  async enqueuePasswordReset(payload: Omit<PasswordResetMailJob, 'kind'>): Promise<void> {
    await this.mailQueue.add(
      'password_reset',
      { kind: 'password_reset', ...payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
    );
  }
}
