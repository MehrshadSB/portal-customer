import type { AppLocale, CalendarType, CustomerRoleSlug, EmployeeRoleSlug, UserStatus, UserType } from './auth';
import type {
  AttachmentUploadStatus,
  AttachmentVisibility,
  ConversationContextType,
  CustomerStatus,
  MessageVisibility,
  OrderOperationalState,
  OrderPriority,
  TicketPriority,
  TicketStatus,
  WorkflowColorToken,
} from './domain';

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
  email: string | null;
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
  email: string | null;
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

export interface WorkflowStatusDto {
  id: string;
  workflowId: string;
  code: string;
  name: string;
  customerLabel: string | null;
  description: string | null;
  colorToken: WorkflowColorToken;
  sortOrder: number;
  isCustomerVisible: boolean;
  isTerminal: boolean;
  defaultDepartmentId: string | null;
}

export interface WorkflowTransitionDto {
  id: string;
  workflowId: string;
  fromStatusId: string;
  toStatusId: string;
  requiredPermission: string | null;
}

export interface WorkflowDto {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  statuses: WorkflowStatusDto[];
  transitions: WorkflowTransitionDto[];
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  lineNumber: number;
  partNumber: string | null;
  name: string;
  material: string | null;
  specification: string | null;
  quantity: string;
  unit: string;
  targetDate: string | null;
  notes: string | null;
}

export interface OrderProgressEventDto {
  id: string;
  orderId: string;
  fromStatusId: string | null;
  toStatusId: string;
  statusNameSnapshot: string;
  statusColorToken: WorkflowColorToken;
  changedByUserId: string;
  changedByName: string | null;
  responsibleDepartmentId: string | null;
  responsibleDepartmentName: string | null;
  responsibleEmployeeId: string | null;
  responsibleEmployeeName: string | null;
  expectedDate: string | null;
  completedAt: string | null;
  note: string | null;
  isCustomerVisible: boolean;
  attachments: AttachmentDto[];
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  workflowId: string;
  currentStatusId: string;
  currentStageCode: string;
  currentStageName: string;
  currentStageColor: WorkflowColorToken;
  currentStageOrder: number;
  totalVisibleStages: number;
  operationalState: OrderOperationalState;
  priority: OrderPriority;
  title: string;
  poNumber: string | null;
  description: string | null;
  internalNotes?: string | null;
  assignedDepartmentId: string | null;
  assignedDepartmentName: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  orderedAt: string;
  expectedCompletionDate: string | null;
  actualCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto extends OrderDto {
  items: OrderItemDto[];
  stages: WorkflowStatusDto[];
  allowedNextStatusIds: string[];
  progressEvents: OrderProgressEventDto[];
  conversationId: string | null;
  ticketsCount: number;
  attachmentsCount: number;
}

export interface TicketCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultDepartmentId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface TicketDto {
  id: string;
  ticketNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  orderId: string | null;
  orderNumber: string | null;
  orderTitle: string | null;
  categoryId: string;
  categoryName: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedDepartmentId: string | null;
  assignedDepartmentName: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  createdByUserId: string;
  createdByName: string | null;
  conversationId: string;
  lastMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetailDto extends TicketDto {
  attachments: AttachmentDto[];
}

export interface ConversationDto {
  id: string;
  customerId: string;
  contextType: ConversationContextType;
  ticketId: string | null;
  orderId: string | null;
  subject: string | null;
  status: 'open' | 'archived';
  assignedEmployeeId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  senderType: UserType;
  visibility: MessageVisibility;
  messageType: 'text' | 'system_event';
  body: string;
  attachments: AttachmentDto[];
  editedAt: string | null;
  createdAt: string;
}

export interface AttachmentDto {
  id: string;
  customerId: string | null;
  uploadedByUserId: string;
  uploadedByName: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadStatus: AttachmentUploadStatus;
  visibility: AttachmentVisibility;
  orderId: string | null;
  orderProgressEventId: string | null;
  ticketId: string | null;
  messageId: string | null;
  createdAt: string;
}

export interface PresignUploadResponseDto {
  attachmentId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface NotificationDto {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceDto {
  id: string;
  eventType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}
