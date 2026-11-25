import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  type PipeTransform,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type CreateContactInput,
  createContactSchema,
  type CreateCustomerInput,
  createCustomerSchema,
  type InviteCustomerMemberInput,
  inviteCustomerMemberSchema,
  type ListCustomersQueryInput,
  listCustomersQuerySchema,
  type UpdateContactInput,
  updateContactSchema,
  type UpdateCustomerInput,
  updateCustomerSchema,
  type UpdateCustomerMemberInput,
  updateCustomerMemberSchema,
  uuidSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  EnforceCustomerParam,
  ReqMeta,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { CustomersService } from './customers.service';

class CustomerIdOrSelfPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (value === 'my-company') return value;
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER_ID',
        message: 'Customer identifier must be a valid UUID or my-company',
      });
    }
    return parsed.data;
  }
}

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @AllowedSurfaces('admin')
  @RequireAnyPermission(PERMISSIONS.CUSTOMER_READ_ALL, PERMISSIONS.CUSTOMER_READ_ASSIGNED)
  @ApiOperation({ summary: 'List B2B customer accounts (Admin)' })
  async list(
    @Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQueryInput,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const { items, meta } = await this.customersService.list(query, actor);
    return { data: items, meta };
  }

  @Post()
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @ApiOperation({ summary: 'Create B2B customer organization (Admin)' })
  async create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.create(body, actor, meta);
    return { data };
  }

  @Get('my-company')
  @AllowedSurfaces('portal')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ_OWN)
  @ApiOperation({ summary: 'Get authenticated customer company profile (Portal)' })
  async getMyCompany(@CurrentUser() actor: AuthenticatedActor) {
    const data = await this.customersService.getById('my-company', actor);
    return { data };
  }

  @Patch('my-company')
  @AllowedSurfaces('portal')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE_OWN)
  @ApiOperation({ summary: 'Update limited customer company fields (Portal Company Admin)' })
  async updateMyCompany(
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.update('my-company', body, actor, meta);
    return { data };
  }

  @Get(':id')
  @AllowedSurfaces('admin')
  @RequireAnyPermission(PERMISSIONS.CUSTOMER_READ_ALL, PERMISSIONS.CUSTOMER_READ_ASSIGNED)
  @ApiOperation({ summary: 'Get customer detail (Admin)' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.customersService.getById(id, actor);
    return { data };
  }

  @Patch(':id')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE_ALL)
  @ApiOperation({ summary: 'Update customer organization (Admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.update(id, body, actor, meta);
    return { data };
  }

  @Delete(':id')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.CUSTOMER_ARCHIVE)
  @ApiOperation({ summary: 'Archive customer organization (Admin)' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    await this.customersService.archive(id, actor, meta);
    return { data: { ok: true } };
  }

  // ---- Contacts ----

  @Get(':id/contacts')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(
    PERMISSIONS.CUSTOMER_READ_ALL,
    PERMISSIONS.CUSTOMER_READ_ASSIGNED,
    PERMISSIONS.CUSTOMER_READ_OWN,
  )
  @ApiOperation({ summary: 'List business contacts for customer organization' })
  async listContacts(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.customersService.listContacts(id, actor);
    return { data };
  }

  @Post(':id/contacts')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(PERMISSIONS.CONTACT_MANAGE_ALL, PERMISSIONS.CONTACT_MANAGE_OWN)
  @ApiOperation({ summary: 'Create business contact for customer organization' })
  async createContact(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.createContact(id, body, actor, meta);
    return { data };
  }

  @Patch(':id/contacts/:contactId')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(PERMISSIONS.CONTACT_MANAGE_ALL, PERMISSIONS.CONTACT_MANAGE_OWN)
  @ApiOperation({ summary: 'Update business contact' })
  async updateContact(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.updateContact(id, contactId, body, actor, meta);
    return { data };
  }

  @Delete(':id/contacts/:contactId')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(PERMISSIONS.CONTACT_MANAGE_ALL, PERMISSIONS.CONTACT_MANAGE_OWN)
  @ApiOperation({ summary: 'Soft-delete business contact' })
  async deleteContact(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    await this.customersService.deleteContact(id, contactId, actor, meta);
    return { data: { ok: true } };
  }

  // ---- Portal Members ----

  @Get(':id/members')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_ALL,
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN,
    PERMISSIONS.CUSTOMER_READ_ALL,
    PERMISSIONS.CUSTOMER_READ_OWN,
  )
  @ApiOperation({ summary: 'List customer portal members' })
  async listMembers(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    const data = await this.customersService.listMembers(id, actor);
    return { data };
  }

  @Post(':id/members/invite')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_ALL,
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN,
  )
  @ApiOperation({ summary: 'Invite a customer portal user' })
  async inviteMember(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @Body(new ZodValidationPipe(inviteCustomerMemberSchema)) body: InviteCustomerMemberInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.inviteMember(id, body, actor, meta);
    return { data };
  }

  @Patch(':id/members/:memberId')
  @EnforceCustomerParam('id')
  @RequireAnyPermission(
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_ALL,
    PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN,
  )
  @ApiOperation({ summary: 'Update customer portal member role or status' })
  async updateMember(
    @Param('id', CustomerIdOrSelfPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodValidationPipe(updateCustomerMemberSchema)) body: UpdateCustomerMemberInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.customersService.updateMember(id, memberId, body, actor, meta);
    return { data };
  }
}
