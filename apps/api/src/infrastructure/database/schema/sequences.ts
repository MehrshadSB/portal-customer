import { pgSequence } from 'drizzle-orm/pg-core';

export const customerCodeSeq = pgSequence('customer_code_seq', { startWith: 1, increment: 1 });
export const employeeCodeSeq = pgSequence('employee_code_seq', { startWith: 1, increment: 1 });
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1, increment: 1 });
export const ticketNumberSeq = pgSequence('ticket_number_seq', { startWith: 1, increment: 1 });
