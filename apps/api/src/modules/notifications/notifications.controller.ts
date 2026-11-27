import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ListNotificationsQueryInput,
  listNotificationsQuerySchema,
  type UpdateNotificationPreferenceInput,
  updateNotificationPreferenceSchema,
} from '@portal/validators';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor } from '../../common/types/auth-context';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for authenticated user' })
  async list(
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.notificationsService.list(query, actor);
    return { data: items, meta };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@CurrentUser() actor: AuthenticatedActor) {
    const unreadCount = await this.notificationsService.unreadCount(actor);
    return { data: { unreadCount } };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark single notification as read' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.notificationsService.markRead(id, actor);
    return { data };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() actor: AuthenticatedActor) {
    await this.notificationsService.markAllRead(actor);
    return { data: { ok: true } };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@CurrentUser() actor: AuthenticatedActor) {
    const data = await this.notificationsService.getPreferences(actor);
    return { data };
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preference for an event type' })
  async updatePreference(
    @Body(new ZodValidationPipe(updateNotificationPreferenceSchema))
    body: UpdateNotificationPreferenceInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.notificationsService.updatePreference(body, actor);
    return { data };
  }
}
