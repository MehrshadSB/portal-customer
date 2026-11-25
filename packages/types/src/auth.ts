export const APP_SURFACES = ['portal', 'admin'] as const;
export type AppSurface = (typeof APP_SURFACES)[number];

export const SUPPORTED_LOCALES = ['fa', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'fa';

export const CALENDAR_TYPES = ['jalali', 'gregorian'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

export const USER_TYPES = ['employee', 'customer'] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_STATUSES = ['invited', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_SCOPES = ['employee', 'customer'] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

export const EMPLOYEE_ROLE_SLUGS = [
  'admin',
  'sales_manager',
  'order_manager',
  'production_staff',
  'support_agent',
] as const;
export type EmployeeRoleSlug = (typeof EMPLOYEE_ROLE_SLUGS)[number];

export const CUSTOMER_ROLE_SLUGS = [
  'customer_admin',
  'customer_member',
  'customer_viewer',
] as const;
export type CustomerRoleSlug = (typeof CUSTOMER_ROLE_SLUGS)[number];

export type RoleSlug = EmployeeRoleSlug | CustomerRoleSlug;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  timezone: string;
  locale: AppLocale;
  userType: UserType;
  status: UserStatus;
  surface: AppSurface;
  customerId: string | null;
  customerName: string | null;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
}
