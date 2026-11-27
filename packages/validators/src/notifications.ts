import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export const updateNotificationPreferenceSchema = z.object({
  eventType: z.string().trim().min(2).max(80),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});

export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;
export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
