import type { AppLocale, CalendarType, CustomerRoleSlug, EmployeeRoleSlug, UserStatus } from './auth';
import type { CustomerStatus } from './domain';

export interface DepartmentDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  leadEmployeeId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDto {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface RoleDto {
  id: string;
  slug: string;
  name: string;
  scope: 'employee' | 'customer';
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
}

export interface EmployeeDto {
  id: string;
  userId: string;
  employeeCode: string;
  email: string;
  fullName: string;
  phone: string | null;
  timezone: string;
  status: UserStatus;
  departmentId: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  isActive: boolean;
  roles: Array<{ id: string; slug: EmployeeRoleSlug | string; name: string }>;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AddressDto {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export interface CustomerDto {
  id: string;
  customerCode: string;
  companyName: string;
  legalName: string | null;
  taxId: string | null;
  industry: string | null;
  website: string | null;
  billingAddress: AddressDto | null;
  shippingAddress: AddressDto | null;
  accountManagerId: string | null;
  accountManagerName: string | null;
  status: CustomerStatus;
  internalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDto {
  id: string;
  customerId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  departmentLabel: string | null;
  isPrimary: boolean;
  notes: string | null;
  linkedMemberId: string | null;
  createdAt: string;
}

export interface CustomerMemberDto {
  id: string;
  customerId: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  userStatus: UserStatus;
  roleId: string;
  roleSlug: CustomerRoleSlug | string;
  roleName: string;
  jobTitle: string | null;
  isPrimary: boolean;
  joinedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: 'employee' | 'customer' | 'system';
  action: string;
  entityType: string;
  entityId: string | null;
  customerId: string | null;
  summary: string;
  beforeJson: unknown;
  afterJson: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface LocalizationSettingsDto {
  defaultLocale: AppLocale;
  enabledLocales: AppLocale[];
  calendarType: CalendarType;
  brandNameFa: string;
  brandNameEn: string;
  updatedAt: string;
}
