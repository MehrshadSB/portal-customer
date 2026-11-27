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
import { PERMISSIONS } from '@portal/types';
import {
  type CreateTicketInput,
  createTicketSchema,
  type ListTicketsQueryInput,
  listTicketsQuerySchema,
  type ReopenTicketInput,
  reopenTicketSchema,
  type UpdateTicketInput,
  updateTicketSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  ReqMeta,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List active support ticket categories' })
  async listCategories() {
    const data = await this.ticketsService.listCategories();
    return { data };
  }

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.TICKET_READ_ALL,
    PERMISSIONS.TICKET_READ_DEPARTMENT,
    PERMISSIONS.TICKET_READ_COMPANY,
  )
  @ApiOperation({ summary: 'List support tickets scoped to customer or employee queue' })
  async list(
    @Query(new ZodValidationPipe(listTicketsQuerySchema)) query: ListTicketsQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.ticketsService.list(query, actor);
    return { data: items, meta };
  }

  @Post()
  @RequireAnyPermission(PERMISSIONS.TICKET_CREATE_COMPANY, PERMISSIONS.TICKET_CREATE_ALL)
  @ApiOperation({ summary: 'Create a new support ticket and 1:1 conversation' })
  async create(
    @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ticketsService.create(body, actor, meta);
    return { data };
  }

  @Get(':id')
  @RequireAnyPermission(
    PERMISSIONS.TICKET_READ_ALL,
    PERMISSIONS.TICKET_READ_DEPARTMENT,
    PERMISSIONS.TICKET_READ_COMPANY,
  )
  @ApiOperation({ summary: 'Get support ticket details and conversation handle' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.ticketsService.getById(id, actor);
    return { data };
  }

  @Patch(':id')
  @AllowedSurfaces('admin')
  @RequireAnyPermission(PERMISSIONS.TICKET_UPDATE, PERMISSIONS.TICKET_ASSIGN)
  @ApiOperation({ summary: 'Update ticket status, priority, or assignment (Admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTicketSchema)) body: UpdateTicketInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ticketsService.update(id, body, actor, meta);
    return { data };
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.TICKET_REOPEN)
  @ApiOperation({ summary: 'Reopen a resolved or closed ticket' })
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reopenTicketSchema)) body: ReopenTicketInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ticketsService.reopen(id, body, actor, meta);
    return { data };
  }
}
