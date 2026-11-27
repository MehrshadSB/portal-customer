import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type CreateMessageInput,
  createMessageSchema,
  type ListMessagesQueryInput,
  listMessagesQuerySchema,
  type MarkConversationReadInput,
  markConversationReadSchema,
} from '@portal/validators';
import {
  CurrentUser,
  ReqMeta,
  RequireAnyPermission,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { ConversationsService } from './conversations.service';

@ApiTags('Conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('by-order/:orderId')
  @RequireAnyPermission(
    PERMISSIONS.ORDER_READ_ALL,
    PERMISSIONS.ORDER_READ_DEPARTMENT,
    PERMISSIONS.ORDER_READ_COMPANY,
  )
  @ApiOperation({ summary: 'Get or lazily provision 1:1 conversation thread for an order' })
  async getOrCreateForOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.conversationsService.getOrCreateForOrder(orderId, actor);
    return { data };
  }

  @Get(':id/messages')
  @RequireAnyPermission(PERMISSIONS.MESSAGE_READ_PUBLIC, PERMISSIONS.MESSAGE_READ_INTERNAL)
  @ApiOperation({ summary: 'List conversation messages (internal notes stripped for customers)' })
  async listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.conversationsService.listMessages(id, query, actor);
    return { data: items, meta };
  }

  @Post(':id/messages')
  @RequireAnyPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC, PERMISSIONS.MESSAGE_SEND_INTERNAL)
  @ApiOperation({ summary: 'Post a public reply or internal staff note to a conversation' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.conversationsService.sendMessage(id, body, actor, meta);
    return { data };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation messages as read for current user' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markConversationReadSchema)) body: MarkConversationReadInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    await this.conversationsService.markRead(id, body, actor);
    return { data: { ok: true } };
  }
}
