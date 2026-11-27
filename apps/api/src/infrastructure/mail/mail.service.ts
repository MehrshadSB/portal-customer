import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  MAIL_QUEUE_NAME,
  type MailJobPayload,
  type NotificationMailJob,
  type ProfileProvisionedMailJob,
} from './mail.processor';

@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue<MailJobPayload>) {}

  async enqueueProfileProvisioned(payload: Omit<ProfileProvisionedMailJob, 'kind'>): Promise<void> {
    await this.mailQueue.add(
      'profile_provisioned',
      { kind: 'profile_provisioned', ...payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
    );
  }

  async enqueueNotification(payload: Omit<NotificationMailJob, 'kind'>): Promise<void> {
    await this.mailQueue.add(
      'notification',
      { kind: 'notification', ...payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
    );
  }
}
