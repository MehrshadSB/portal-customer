export const PERMISSIONS = {
  // Customers, Members & Contacts
  CUSTOMER_READ_ALL: 'customer:read:all',
  CUSTOMER_READ_ASSIGNED: 'customer:read:assigned',
  CUSTOMER_READ_OWN: 'customer:read:own',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE_ALL: 'customer:update:all',
  CUSTOMER_UPDATE_OWN: 'customer:update:own',
  CUSTOMER_ARCHIVE: 'customer:archive',
  CUSTOMER_MEMBER_MANAGE_ALL: 'customer_member:manage:all',
  CUSTOMER_MEMBER_MANAGE_OWN: 'customer_member:manage:own',
  CONTACT_MANAGE_ALL: 'contact:manage:all',
  CONTACT_MANAGE_OWN: 'contact:manage:own',

  // Orders & Workflows
  ORDER_READ_ALL: 'order:read:all',
  ORDER_READ_DEPARTMENT: 'order:read:department',
  ORDER_READ_COMPANY: 'order:read:company',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_ASSIGN: 'order:assign',
  ORDER_ADVANCE_ALL: 'order:advance_status:all',
  ORDER_ADVANCE_ASSIGNED: 'order:advance_status:assigned',
  ORDER_INTERNAL_NOTE: 'order:internal_note',
  WORKFLOW_CONFIGURE: 'workflow:configure',

  // Tickets & Messaging
  TICKET_READ_ALL: 'ticket:read:all',
  TICKET_READ_DEPARTMENT: 'ticket:read:department',
  TICKET_READ_COMPANY: 'ticket:read:company',
  TICKET_CREATE_ALL: 'ticket:create:all',
  TICKET_CREATE_COMPANY: 'ticket:create:company',
  TICKET_UPDATE: 'ticket:update',
  TICKET_ASSIGN: 'ticket:assign',
  TICKET_REOPEN: 'ticket:reopen',

  MESSAGE_READ_PUBLIC: 'message:read:public',
  MESSAGE_READ_INTERNAL: 'message:read:internal',
  MESSAGE_SEND_PUBLIC: 'message:send:public',
  MESSAGE_SEND_INTERNAL: 'message:send:internal',

  // Documents
  DOCUMENT_READ_PUBLIC: 'document:read:public',
  DOCUMENT_READ_INTERNAL: 'document:read:internal',
  DOCUMENT_UPLOAD: 'document:upload',
  DOCUMENT_DELETE_ALL: 'document:delete:all',
  DOCUMENT_DELETE_OWN: 'document:delete:own',

  // Organization & Governance
  EMPLOYEE_MANAGE: 'employee:manage',
  DEPARTMENT_MANAGE: 'department:manage',
  ROLE_PERMISSION_MANAGE: 'role_permission:manage',
  SYSTEM_SETTINGS_MANAGE: 'system_settings:manage',
  AUDIT_LOG_READ: 'audit_log:read',
  REPORT_READ: 'report:read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
