import { relations } from 'drizzle-orm';
import { contacts, customerMembers, customers } from './customers';
import {
  departments,
  employeeRoles,
  employees,
  permissions,
  rolePermissions,
  roles,
  userIdentities,
  users,
} from './identity';
import {
  orderItems,
  orderProgressEvents,
  orderWorkflowStatuses,
  orderWorkflowTransitions,
  orderWorkflows,
  orders,
} from './orders';
import { attachments, auditLogs, notificationPreferences, notifications } from './platform';
import {
  conversationParticipants,
  conversations,
  messages,
  ticketCategories,
  tickets,
} from './ticketing';

export const usersRelations = relations(users, ({ one, many }) => ({
  employee: one(employees, { fields: [users.id], references: [employees.userId] }),
  customerMember: one(customerMembers, { fields: [users.id], references: [customerMembers.userId] }),
  identities: many(userIdentities),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, { fields: [userIdentities.userId], references: [users.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  roles: many(employeeRoles),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  employeeRoles: many(employeeRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const employeeRolesRelations = relations(employeeRoles, ({ one }) => ({
  employee: one(employees, { fields: [employeeRoles.employeeId], references: [employees.id] }),
  role: one(roles, { fields: [employeeRoles.roleId], references: [roles.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  accountManager: one(employees, {
    fields: [customers.accountManagerId],
    references: [employees.id],
  }),
  members: many(customerMembers),
  contacts: many(contacts),
  orders: many(orders),
  tickets: many(tickets),
}));

export const customerMembersRelations = relations(customerMembers, ({ one }) => ({
  customer: one(customers, { fields: [customerMembers.customerId], references: [customers.id] }),
  user: one(users, { fields: [customerMembers.userId], references: [users.id] }),
  role: one(roles, { fields: [customerMembers.roleId], references: [roles.id] }),
}));

export const orderWorkflowsRelations = relations(orderWorkflows, ({ many }) => ({
  statuses: many(orderWorkflowStatuses),
  transitions: many(orderWorkflowTransitions),
}));

export const orderWorkflowStatusesRelations = relations(orderWorkflowStatuses, ({ one }) => ({
  workflow: one(orderWorkflows, {
    fields: [orderWorkflowStatuses.workflowId],
    references: [orderWorkflows.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  workflow: one(orderWorkflows, { fields: [orders.workflowId], references: [orderWorkflows.id] }),
  currentStatus: one(orderWorkflowStatuses, {
    fields: [orders.currentStatusId],
    references: [orderWorkflowStatuses.id],
  }),
  items: many(orderItems),
  progressEvents: many(orderProgressEvents),
  tickets: many(tickets),
  conversation: one(conversations, { fields: [orders.id], references: [conversations.orderId] }),
  attachments: many(attachments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const orderProgressEventsRelations = relations(orderProgressEvents, ({ one }) => ({
  order: one(orders, { fields: [orderProgressEvents.orderId], references: [orders.id] }),
  toStatus: one(orderWorkflowStatuses, {
    fields: [orderProgressEvents.toStatusId],
    references: [orderWorkflowStatuses.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  customer: one(customers, { fields: [tickets.customerId], references: [customers.id] }),
  order: one(orders, { fields: [tickets.orderId], references: [orders.id] }),
  category: one(ticketCategories, {
    fields: [tickets.categoryId],
    references: [ticketCategories.id],
  }),
  conversation: one(conversations, {
    fields: [tickets.id],
    references: [conversations.ticketId],
  }),
  attachments: many(attachments),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  customer: one(customers, { fields: [conversations.customerId], references: [customers.id] }),
  ticket: one(tickets, { fields: [conversations.ticketId], references: [tickets.id] }),
  order: one(orders, { fields: [conversations.orderId], references: [orders.id] }),
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
  attachments: many(attachments),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
