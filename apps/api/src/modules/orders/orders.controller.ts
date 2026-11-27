import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type AdvanceOrderProgressInput,
  advanceOrderProgressSchema,
  type CreateOrderInput,
  createOrderSchema,
  type ListOrdersQueryInput,
  listOrdersQuerySchema,
  type UpdateOrderInput,
  updateOrderSchema,
  type UpdateOrderStateInput,
  updateOrderStateSchema,
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
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.ORDER_READ_ALL,
    PERMISSIONS.ORDER_READ_DEPARTMENT,
    PERMISSIONS.ORDER_READ_COMPANY,
  )
  @ApiOperation({ summary: 'List orders scoped to customer organization or employee queue' })
  async list(
    @Query(new ZodValidationPipe(listOrdersQuerySchema)) query: ListOrdersQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.ordersService.list(query, actor);
    return { data: items, meta };
  }

  @Post()
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.ORDER_CREATE)
  @ApiOperation({ summary: 'Create a new custom manufacturing order (Admin)' })
  async create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ordersService.create(body, actor, meta);
    return { data };
  }

  @Get(':id')
  @RequireAnyPermission(
    PERMISSIONS.ORDER_READ_ALL,
    PERMISSIONS.ORDER_READ_DEPARTMENT,
    PERMISSIONS.ORDER_READ_COMPANY,
  )
  @ApiOperation({ summary: 'Get order details, line items, workflow stages, and progress timeline' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.ordersService.getById(id, actor);
    return { data };
  }

  @Patch(':id')
  @AllowedSurfaces('admin')
  @RequireAnyPermission(PERMISSIONS.ORDER_UPDATE, PERMISSIONS.ORDER_ASSIGN)
  @ApiOperation({ summary: 'Update order metadata or staff assignment (Admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOrderSchema)) body: UpdateOrderInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ordersService.update(id, body, actor, meta);
    return { data };
  }

  @Patch(':id/state')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.ORDER_UPDATE)
  @ApiOperation({ summary: 'Transition operational order state (active, on_hold, completed, cancelled)' })
  async updateState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOrderStateSchema)) body: UpdateOrderStateInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ordersService.updateState(id, body, actor, meta);
    return { data };
  }

  @Post(':id/progress')
  @AllowedSurfaces('admin')
  @RequireAnyPermission(PERMISSIONS.ORDER_ADVANCE_ALL, PERMISSIONS.ORDER_ADVANCE_ASSIGNED)
  @ApiOperation({ summary: 'Advance order to a workflow stage and append immutable progress event' })
  async advanceProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advanceOrderProgressSchema)) body: AdvanceOrderProgressInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.ordersService.advanceProgress(id, body, actor, meta);
    return { data };
  }
}
