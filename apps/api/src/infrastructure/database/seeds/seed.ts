import { PERMISSIONS } from '@portal/types';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import * as schema from '../schema';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const ROLE_DEFINITIONS = [
  {
    slug: 'admin',
    name: 'System Administrator',
    scope: 'employee' as const,
    description: 'Full administrative control over platform configuration, RBAC, and operations',
    permissions: Object.values(PERMISSIONS),
  },
  {
    slug: 'sales_manager',
    name: 'Sales / Account Manager',
    scope: 'employee' as const,
    description: 'Customer CRM, onboarding, contacts, and order intake',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_ALL,
      PERMISSIONS.CUSTOMER_CREATE,
      PERMISSIONS.CUSTOMER_UPDATE_ALL,
      PERMISSIONS.CUSTOMER_MEMBER_MANAGE_ALL,
      PERMISSIONS.CONTACT_MANAGE_ALL,
      PERMISSIONS.ORDER_READ_ALL,
      PERMISSIONS.ORDER_CREATE,
      PERMISSIONS.ORDER_UPDATE,
      PERMISSIONS.ORDER_INTERNAL_NOTE,
      PERMISSIONS.TICKET_READ_ALL,
      PERMISSIONS.TICKET_CREATE_ALL,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_READ_INTERNAL,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_INTERNAL,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_INTERNAL,
      PERMISSIONS.DOCUMENT_UPLOAD,
      PERMISSIONS.DOCUMENT_DELETE_ALL,
      PERMISSIONS.REPORT_READ,
    ],
  },
  {
    slug: 'order_manager',
    name: 'Order & Production Manager',
    scope: 'employee' as const,
    description: 'End-to-end manufacturing order execution, assignments, and milestone transitions',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_ALL,
      PERMISSIONS.ORDER_READ_ALL,
      PERMISSIONS.ORDER_CREATE,
      PERMISSIONS.ORDER_UPDATE,
      PERMISSIONS.ORDER_ASSIGN,
      PERMISSIONS.ORDER_ADVANCE_ALL,
      PERMISSIONS.ORDER_INTERNAL_NOTE,
      PERMISSIONS.WORKFLOW_CONFIGURE,
      PERMISSIONS.TICKET_READ_ALL,
      PERMISSIONS.TICKET_CREATE_ALL,
      PERMISSIONS.TICKET_UPDATE,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_REOPEN,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_READ_INTERNAL,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_INTERNAL,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_INTERNAL,
      PERMISSIONS.DOCUMENT_UPLOAD,
      PERMISSIONS.DOCUMENT_DELETE_ALL,
      PERMISSIONS.AUDIT_LOG_READ,
      PERMISSIONS.REPORT_READ,
    ],
  },
  {
    slug: 'production_staff',
    name: 'Production / Engineering Staff',
    scope: 'employee' as const,
    description: 'Department-scoped production order visibility, progress updates, and shop-floor notes',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_ASSIGNED,
      PERMISSIONS.ORDER_READ_DEPARTMENT,
      PERMISSIONS.ORDER_ADVANCE_ASSIGNED,
      PERMISSIONS.ORDER_INTERNAL_NOTE,
      PERMISSIONS.TICKET_READ_DEPARTMENT,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_READ_INTERNAL,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_INTERNAL,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_INTERNAL,
      PERMISSIONS.DOCUMENT_UPLOAD,
    ],
  },
  {
    slug: 'support_agent',
    name: 'Customer Support Agent',
    scope: 'employee' as const,
    description: 'Support ticket triage, customer communication, and internal escalation',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_ALL,
      PERMISSIONS.ORDER_READ_ALL,
      PERMISSIONS.ORDER_INTERNAL_NOTE,
      PERMISSIONS.TICKET_READ_ALL,
      PERMISSIONS.TICKET_CREATE_ALL,
      PERMISSIONS.TICKET_UPDATE,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_REOPEN,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_READ_INTERNAL,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_INTERNAL,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_INTERNAL,
      PERMISSIONS.DOCUMENT_UPLOAD,
      PERMISSIONS.DOCUMENT_DELETE_OWN,
      PERMISSIONS.REPORT_READ,
    ],
  },
  {
    slug: 'customer_admin',
    name: 'Customer Company Admin',
    scope: 'customer' as const,
    description: 'Full customer portal access plus managing members and contacts within own company',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_OWN,
      PERMISSIONS.CUSTOMER_UPDATE_OWN,
      PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN,
      PERMISSIONS.CONTACT_MANAGE_OWN,
      PERMISSIONS.ORDER_READ_COMPANY,
      PERMISSIONS.TICKET_READ_COMPANY,
      PERMISSIONS.TICKET_CREATE_COMPANY,
      PERMISSIONS.TICKET_REOPEN,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_UPLOAD,
      PERMISSIONS.DOCUMENT_DELETE_OWN,
    ],
  },
  {
    slug: 'customer_member',
    name: 'Customer Member',
    scope: 'customer' as const,
    description: 'Standard customer portal member able to track orders, submit tickets, and upload files',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_OWN,
      PERMISSIONS.ORDER_READ_COMPANY,
      PERMISSIONS.TICKET_READ_COMPANY,
      PERMISSIONS.TICKET_CREATE_COMPANY,
      PERMISSIONS.TICKET_REOPEN,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.MESSAGE_SEND_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_UPLOAD,
    ],
  },
  {
    slug: 'customer_viewer',
    name: 'Customer Viewer',
    scope: 'customer' as const,
    description: 'Read-only portal access to company orders, documents, and tickets',
    permissions: [
      PERMISSIONS.CUSTOMER_READ_OWN,
      PERMISSIONS.ORDER_READ_COMPANY,
      PERMISSIONS.TICKET_READ_COMPANY,
      PERMISSIONS.MESSAGE_READ_PUBLIC,
      PERMISSIONS.DOCUMENT_READ_PUBLIC,
    ],
  },
];

async function runSeed(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://portal:portal_dev_password@localhost:5433/portal_dev';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    // 0. Seed default platform localization settings (Persian default + Jalali calendar)
    await db
      .insert(schema.platformSettings)
      .values({
        key: 'localization',
        defaultLocale: 'fa',
        enabledLocales: ['fa', 'en'],
        calendarType: 'jalali',
        brandNameFa: 'آذرپارت صنعت',
        brandNameEn: 'AzarPart Mfg',
      })
      .onConflictDoNothing();

    // 1. Seed permissions catalog
    const permissionRows = Object.values(PERMISSIONS).map((key) => {
      const parts = key.split(':');
      return {
        key,
        resource: parts[0] ?? 'system',
        action: parts.slice(1).join(':') || 'read',
        description: `Permission for ${key}`,
      };
    });

    await db.insert(schema.permissions).values(permissionRows).onConflictDoNothing();
    const allPermissions = await db.select().from(schema.permissions);
    const permIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

    // 2. Seed roles and role_permissions
    for (const def of ROLE_DEFINITIONS) {
      await db
        .insert(schema.roles)
        .values({
          slug: def.slug,
          name: def.name,
          scope: def.scope,
          description: def.description,
          isSystem: true,
        })
        .onConflictDoNothing();

      const [role] = await db.select().from(schema.roles).where(eq(schema.roles.slug, def.slug));
      if (!role) continue;

      const mappings = def.permissions
        .map((key) => permIdByKey.get(key))
        .filter((pid): pid is string => Boolean(pid))
        .map((permissionId) => ({ roleId: role.id, permissionId }));

      if (mappings.length > 0) {
        await db.insert(schema.rolePermissions).values(mappings).onConflictDoNothing();
      }
    }

    // 3. Seed departments
    const departmentDefs = [
      { code: 'SALES', name: 'Sales & Account Management', description: 'Customer onboarding and commercial quotes' },
      { code: 'ENG', name: 'Engineering & CAD', description: 'Technical review, tolerances, and DFM sign-off' },
      { code: 'PROD', name: 'Production & CNC Fabrication', description: 'Machining, welding, and assembly operations' },
      { code: 'QC', name: 'Quality Control', description: 'CMM inspection, certifications, and test sign-off' },
      { code: 'LOG', name: 'Logistics & Dispatch', description: 'Packaging, freight scheduling, and delivery' },
      { code: 'SUP', name: 'Customer Support', description: 'Post-order technical support and issue resolution' },
    ];
    await db.insert(schema.departments).values(departmentDefs).onConflictDoNothing();
    const allDepts = await db.select().from(schema.departments);
    const deptByCode = new Map(allDepts.map((d) => [d.code, d.id]));

    // 4. Seed default 7-stage manufacturing workflow
    await db
      .insert(schema.orderWorkflows)
      .values({
        name: 'Standard Custom Manufacturing',
        description: 'Default 7-stage B2B custom fabrication workflow',
        isDefault: true,
        isActive: true,
      })
      .onConflictDoNothing();

    const [defaultWorkflow] = await db
      .select()
      .from(schema.orderWorkflows)
      .where(eq(schema.orderWorkflows.isDefault, true));

    if (defaultWorkflow) {
      const statuses = [
        {
          workflowId: defaultWorkflow.id,
          code: 'order_received',
          name: 'Order Received',
          customerLabel: 'Order Received',
          description: 'PO and order details logged in production queue',
          colorToken: 'slate' as const,
          sortOrder: 1,
          isCustomerVisible: true,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('SALES') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'technical_review',
          name: 'Technical Review',
          customerLabel: 'Engineering Review',
          description: 'Internal CAD, BOM, and manufacturability verification',
          colorToken: 'amber' as const,
          sortOrder: 2,
          isCustomerVisible: false,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('ENG') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'approved',
          name: 'Approved',
          customerLabel: 'Approved for Production',
          description: 'Engineering sign-off completed and scheduled for shop floor',
          colorToken: 'cobalt' as const,
          sortOrder: 3,
          isCustomerVisible: true,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('PROD') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'in_production',
          name: 'In Production',
          customerLabel: 'In Production',
          description: 'Active machining, fabrication, and assembly',
          colorToken: 'cobalt' as const,
          sortOrder: 4,
          isCustomerVisible: true,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('PROD') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'quality_control',
          name: 'Quality Control',
          customerLabel: 'Quality Inspection',
          description: 'Dimensional inspection and compliance verification',
          colorToken: 'amber' as const,
          sortOrder: 5,
          isCustomerVisible: true,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('QC') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'ready_for_delivery',
          name: 'Ready for Delivery',
          customerLabel: 'Ready for Dispatch',
          description: 'Passed QC, crated, and awaiting carrier pickup',
          colorToken: 'emerald' as const,
          sortOrder: 6,
          isCustomerVisible: true,
          isTerminal: false,
          defaultDepartmentId: deptByCode.get('LOG') ?? null,
        },
        {
          workflowId: defaultWorkflow.id,
          code: 'delivered',
          name: 'Delivered',
          customerLabel: 'Delivered',
          description: 'Shipment delivered and confirmed',
          colorToken: 'emerald' as const,
          sortOrder: 7,
          isCustomerVisible: true,
          isTerminal: true,
          defaultDepartmentId: deptByCode.get('LOG') ?? null,
        },
      ];
      await db.insert(schema.orderWorkflowStatuses).values(statuses).onConflictDoNothing();
    }

    // 5. Seed ticket categories
    const categories = [
      { slug: 'order_status', name: 'Order Status & Scheduling', defaultDepartmentId: deptByCode.get('SUP') ?? null, sortOrder: 1 },
      { slug: 'spec_change', name: 'Drawing / Spec Revision', defaultDepartmentId: deptByCode.get('ENG') ?? null, sortOrder: 2 },
      { slug: 'quality_issue', name: 'Quality & Inspection Inquiry', defaultDepartmentId: deptByCode.get('QC') ?? null, sortOrder: 3 },
      { slug: 'delivery_logistics', name: 'Shipping & Logistics', defaultDepartmentId: deptByCode.get('LOG') ?? null, sortOrder: 4 },
      { slug: 'portal_access', name: 'Account & Portal Access', defaultDepartmentId: deptByCode.get('SUP') ?? null, sortOrder: 5 },
      { slug: 'general_inquiry', name: 'General Support', defaultDepartmentId: deptByCode.get('SUP') ?? null, sortOrder: 6 },
    ];
    await db.insert(schema.ticketCategories).values(categories).onConflictDoNothing();

    // 6. Seed development sample accounts, customer, order & ticket if none exist
    const existingAdmin = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = 'admin@platform.local'`);

    if (existingAdmin.length === 0) {
      const devPasswordHash = await argon2.hash('DevPassword123!', {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });

      const allRoles = await db.select().from(schema.roles);
      const roleBySlug = new Map(allRoles.map((r) => [r.slug, r.id]));

      // Create employee accounts
      const [adminUser] = await db
        .insert(schema.users)
        .values({
          email: 'admin@platform.local',
          passwordHash: devPasswordHash,
          fullName: 'Elena Vance',
          userType: 'employee',
          status: 'active',
        })
        .returning();

      const [orderMgrUser] = await db
        .insert(schema.users)
        .values({
          email: 'orders@platform.local',
          passwordHash: devPasswordHash,
          fullName: 'Marcus Thorne',
          userType: 'employee',
          status: 'active',
        })
        .returning();

      const [supportUser] = await db
        .insert(schema.users)
        .values({
          email: 'support@platform.local',
          passwordHash: devPasswordHash,
          fullName: 'Nadia Chen',
          userType: 'employee',
          status: 'active',
        })
        .returning();

      if (adminUser && orderMgrUser && supportUser) {
        const [adminEmp] = await db
          .insert(schema.employees)
          .values({
            userId: adminUser.id,
            employeeCode: 'EMP-0001',
            departmentId: deptByCode.get('ENG') ?? null,
            jobTitle: 'VP of Operations',
          })
          .returning();

        const [orderEmp] = await db
          .insert(schema.employees)
          .values({
            userId: orderMgrUser.id,
            employeeCode: 'EMP-0002',
            departmentId: deptByCode.get('PROD') ?? null,
            jobTitle: 'Lead Order Manager',
          })
          .returning();

        const [supportEmp] = await db
          .insert(schema.employees)
          .values({
            userId: supportUser.id,
            employeeCode: 'EMP-0003',
            departmentId: deptByCode.get('SUP') ?? null,
            jobTitle: 'Senior Support Specialist',
          })
          .returning();

        if (adminEmp && roleBySlug.get('admin')) {
          await db.insert(schema.employeeRoles).values({
            employeeId: adminEmp.id,
            roleId: roleBySlug.get('admin')!,
          });
        }
        if (orderEmp && roleBySlug.get('order_manager')) {
          await db.insert(schema.employeeRoles).values({
            employeeId: orderEmp.id,
            roleId: roleBySlug.get('order_manager')!,
          });
        }
        if (supportEmp && roleBySlug.get('support_agent')) {
          await db.insert(schema.employeeRoles).values({
            employeeId: supportEmp.id,
            roleId: roleBySlug.get('support_agent')!,
          });
        }

        // Create sample B2B customer & customer admin
        const [customer] = await db
          .insert(schema.customers)
          .values({
            customerCode: 'CUS-0001',
            companyName: 'Apex Aerospace Mfg',
            legalName: 'Apex Aerospace Manufacturing Inc.',
            industry: 'Aerospace & Defense',
            accountManagerId: orderEmp?.id ?? null,
            status: 'active',
            billingAddress: {
              line1: '450 Precision Way',
              city: 'Wichita',
              state: 'KS',
              postalCode: '67202',
              country: 'US',
            },
          })
          .returning();

        const [buyerUser] = await db
          .insert(schema.users)
          .values({
            email: 'buyer@apex-aero.local',
            passwordHash: devPasswordHash,
            fullName: 'Daniel Mercer',
            userType: 'customer',
            status: 'active',
          })
          .returning();

        if (customer && buyerUser && roleBySlug.get('customer_admin')) {
          await db.insert(schema.customerMembers).values({
            customerId: customer.id,
            userId: buyerUser.id,
            roleId: roleBySlug.get('customer_admin')!,
            jobTitle: 'Director of Procurement',
            isPrimary: true,
            joinedAt: new Date(),
          });

          await db.insert(schema.contacts).values({
            customerId: customer.id,
            fullName: 'Claire Donovan',
            email: 'receiving@apex-aero.local',
            phone: '+1-316-555-0194',
            jobTitle: 'Receiving & QA Lead',
            departmentLabel: 'Receiving Dock B',
            isPrimary: false,
          });

          // Create sample order
          if (defaultWorkflow) {
            const workflowStatuses = await db
              .select()
              .from(schema.orderWorkflowStatuses)
              .where(eq(schema.orderWorkflowStatuses.workflowId, defaultWorkflow.id));
            const inProd = workflowStatuses.find((s) => s.code === 'in_production') ?? workflowStatuses[0];
            const received = workflowStatuses.find((s) => s.code === 'order_received');

            if (inProd) {
              const [sampleOrder] = await db
                .insert(schema.orders)
                .values({
                  orderNumber: 'ORD-2026-0001',
                  customerId: customer.id,
                  workflowId: defaultWorkflow.id,
                  currentStatusId: inProd.id,
                  operationalState: 'active',
                  priority: 'high',
                  title: '5-Axis Titanium Turbine Bracket Batch',
                  poNumber: 'PO-APEX-88412',
                  description: 'CNC milled Ti-6Al-4V aerospace mounting brackets per Rev C drawing.',
                  assignedDepartmentId: deptByCode.get('PROD') ?? null,
                  assignedEmployeeId: orderEmp?.id ?? null,
                  expectedCompletionDate: '2026-12-18',
                  createdByUserId: orderMgrUser.id,
                })
                .returning();

              if (sampleOrder) {
                await db.insert(schema.orderItems).values([
                  {
                    orderId: sampleOrder.id,
                    lineNumber: 1,
                    partNumber: 'APX-TB-401-C',
                    name: 'Primary Gimbal Mounting Bracket',
                    material: 'Ti-6Al-4V Grade 5',
                    specification: '±0.015mm tolerance on bore axes; AMS 4911 certified stock',
                    quantity: '24',
                    unit: 'pcs',
                  },
                  {
                    orderId: sampleOrder.id,
                    lineNumber: 2,
                    partNumber: 'APX-HP-109-A',
                    name: 'Anodized Sensor Housing Plate',
                    material: '7075-T6 Aluminum',
                    specification: 'MIL-A-8625 Type III hard anodize black',
                    quantity: '24',
                    unit: 'pcs',
                  },
                ]);

                if (received) {
                  await db.insert(schema.orderProgressEvents).values([
                    {
                      orderId: sampleOrder.id,
                      fromStatusId: null,
                      toStatusId: received.id,
                      statusNameSnapshot: received.name,
                      changedByUserId: orderMgrUser.id,
                      responsibleDepartmentId: deptByCode.get('SALES') ?? null,
                      note: 'PO verified and logged into Q4 production schedule.',
                      isCustomerVisible: true,
                    },
                    {
                      orderId: sampleOrder.id,
                      fromStatusId: received.id,
                      toStatusId: inProd.id,
                      statusNameSnapshot: inProd.name,
                      changedByUserId: orderMgrUser.id,
                      responsibleDepartmentId: deptByCode.get('PROD') ?? null,
                      responsibleEmployeeId: orderEmp?.id ?? null,
                      note: 'Roughing and 5-axis finishing underway on Cell #3.',
                      isCustomerVisible: true,
                    },
                  ]);
                }

                // Sample ticket + unified 1:1 conversation
                const [specCategory] = await db
                  .select()
                  .from(schema.ticketCategories)
                  .where(eq(schema.ticketCategories.slug, 'spec_change'));

                if (specCategory) {
                  const [sampleTicket] = await db
                    .insert(schema.tickets)
                    .values({
                      ticketNumber: 'TCK-2026-0001',
                      customerId: customer.id,
                      orderId: sampleOrder.id,
                      categoryId: specCategory.id,
                      subject: 'Confirm chamfer callout on APX-TB-401-C',
                      description:
                        'Please verify whether edge break on inner flange should remain 0.5mm x 45 deg before final finishing pass.',
                      status: 'in_progress',
                      priority: 'high',
                      assignedDepartmentId: deptByCode.get('SUP') ?? null,
                      assignedEmployeeId: supportEmp?.id ?? null,
                      createdByUserId: buyerUser.id,
                    })
                    .returning();

                  if (sampleTicket) {
                    const [conv] = await db
                      .insert(schema.conversations)
                      .values({
                        customerId: customer.id,
                        contextType: 'ticket',
                        ticketId: sampleTicket.id,
                        subject: sampleTicket.subject,
                        assignedEmployeeId: supportEmp?.id ?? null,
                        lastMessageAt: new Date(),
                      })
                      .returning();

                    if (conv) {
                      await db.insert(schema.messages).values([
                        {
                          conversationId: conv.id,
                          senderUserId: buyerUser.id,
                          visibility: 'public',
                          body: 'Our QA lead flagged the flange edge break on Rev C—please confirm shop floor is holding 0.5mm.',
                        },
                        {
                          conversationId: conv.id,
                          senderUserId: supportUser.id,
                          visibility: 'internal',
                          body: 'Internal check with Cell #3 CAM programmer: toolpath is already programmed at 0.5mm x 45 deg.',
                        },
                        {
                          conversationId: conv.id,
                          senderUserId: supportUser.id,
                          visibility: 'public',
                          body: 'Confirmed with our CNC engineering team—CAM program holds 0.5mm x 45 deg per Rev C.',
                        },
                      ]);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Advance sequence values past seeded records so new records never collide
    await db.execute(
      sql`SELECT setval('customer_code_seq', GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_code, '[^0-9]', '', 'g'), '')::int), 1) FROM customers), 1))`,
    );
    await db.execute(
      sql`SELECT setval('employee_code_seq', GREATEST((SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '[^0-9]', '', 'g'), '')::int), 1) FROM employees), 1))`,
    );
    await db.execute(
      sql`SELECT setval('order_number_seq', GREATEST((SELECT COALESCE(MAX(NULLIF(split_part(order_number, '-', 3), '')::int), 1) FROM orders), 1))`,
    );
    await db.execute(
      sql`SELECT setval('ticket_number_seq', GREATEST((SELECT COALESCE(MAX(NULLIF(split_part(ticket_number, '-', 3), '')::int), 1) FROM tickets), 1))`,
    );

    console.log('Seed completed successfully.');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
