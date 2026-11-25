CREATE TYPE "public"."attachment_upload_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attachment_visibility" AS ENUM('customer_visible', 'internal_only');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('employee', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."auth_token_purpose" AS ENUM('invite', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."conversation_context_type" AS ENUM('ticket', 'order', 'customer');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'archived');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('prospect', 'active', 'on_hold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'system_event');--> statement-breakpoint
CREATE TYPE "public"."message_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "public"."order_operational_state" AS ENUM('draft', 'active', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('low', 'normal', 'high', 'rush');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('owner', 'assignee', 'follower');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('employee', 'customer');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('employee', 'customer');--> statement-breakpoint
CREATE TYPE "public"."workflow_color_token" AS ENUM('slate', 'cobalt', 'amber', 'emerald', 'crimson');--> statement-breakpoint
CREATE SEQUENCE "public"."customer_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."employee_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(32) NOT NULL,
	"description" text,
	"lead_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name"),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employee_roles" (
	"employee_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_roles_employee_id_role_id_pk" PRIMARY KEY("employee_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_code" varchar(32) NOT NULL,
	"department_id" uuid,
	"job_title" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"resource" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"scope" "role_scope" NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"full_name" varchar(150) NOT NULL,
	"phone" varchar(40),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"user_type" "user_type" NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"email" varchar(255),
	"phone" varchar(40),
	"job_title" varchar(120),
	"department_label" varchar(100),
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"linked_member_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"job_title" varchar(120),
	"is_primary" boolean DEFAULT false NOT NULL,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_code" varchar(32) NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"legal_name" varchar(200),
	"tax_id" varchar(64),
	"industry" varchar(100),
	"website" varchar(255),
	"billing_address" jsonb,
	"shipping_address" jsonb,
	"account_manager_id" uuid,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"internal_notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_code_unique" UNIQUE("customer_code")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"part_number" varchar(80),
	"name" varchar(200) NOT NULL,
	"material" varchar(120),
	"specification" text,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" varchar(32) DEFAULT 'pcs' NOT NULL,
	"target_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_order_item_line" UNIQUE("order_id","line_number")
);
--> statement-breakpoint
CREATE TABLE "order_progress_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status_id" uuid,
	"to_status_id" uuid NOT NULL,
	"status_name_snapshot" varchar(100) NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"responsible_department_id" uuid,
	"responsible_employee_id" uuid,
	"expected_date" date,
	"completed_at" timestamp with time zone,
	"note" text,
	"is_customer_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_workflow_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"customer_label" varchar(100),
	"description" text,
	"color_token" "workflow_color_token" DEFAULT 'slate' NOT NULL,
	"sort_order" integer NOT NULL,
	"is_customer_visible" boolean DEFAULT true NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"default_department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_workflow_status_code" UNIQUE("workflow_id","code"),
	CONSTRAINT "uq_workflow_status_order" UNIQUE("workflow_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "order_workflow_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"from_status_id" uuid NOT NULL,
	"to_status_id" uuid NOT NULL,
	"required_permission" varchar(100),
	CONSTRAINT "uq_workflow_transition" UNIQUE("workflow_id","from_status_id","to_status_id")
);
--> statement-breakpoint
CREATE TABLE "order_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_workflows_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"current_status_id" uuid NOT NULL,
	"operational_state" "order_operational_state" DEFAULT 'active' NOT NULL,
	"priority" "order_priority" DEFAULT 'normal' NOT NULL,
	"title" varchar(200) NOT NULL,
	"po_number" varchar(80),
	"description" text,
	"internal_notes" text,
	"assigned_department_id" uuid,
	"assigned_employee_id" uuid,
	"ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_completion_date" date,
	"actual_completion_date" date,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"participant_role" "participant_role" DEFAULT 'follower' NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_conversation_participant" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"context_type" "conversation_context_type" NOT NULL,
	"ticket_id" uuid,
	"order_id" uuid,
	"subject" varchar(200),
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"assigned_employee_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_ticket_id_unique" UNIQUE("ticket_id"),
	CONSTRAINT "conversations_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "chk_conversations_context" CHECK ((("conversations"."context_type" = 'ticket' AND "conversations"."ticket_id" IS NOT NULL AND "conversations"."order_id" IS NULL) OR ("conversations"."context_type" = 'order' AND "conversations"."order_id" IS NOT NULL AND "conversations"."ticket_id" IS NULL) OR ("conversations"."context_type" = 'customer' AND "conversations"."ticket_id" IS NULL AND "conversations"."order_id" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"visibility" "message_visibility" DEFAULT 'public' NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"default_department_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "ticket_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"category_id" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"assigned_department_id" uuid,
	"assigned_employee_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"reopened_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"uploaded_by_user_id" uuid NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64),
	"upload_status" "attachment_upload_status" DEFAULT 'pending' NOT NULL,
	"visibility" "attachment_visibility" DEFAULT 'customer_visible' NOT NULL,
	"order_id" uuid,
	"order_progress_event_id" uuid,
	"ticket_id" uuid,
	"message_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "chk_attachments_target" CHECK (num_nonnulls("attachments"."customer_id", "attachments"."order_id", "attachments"."order_progress_event_id", "attachments"."ticket_id", "attachments"."message_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"customer_id" uuid,
	"summary" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_notification_pref" UNIQUE("user_id","event_type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" varchar(80) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"action_url" varchar(255),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_lead_employee_id_employees_id_fk" FOREIGN KEY ("lead_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_member_id_customer_members_id_fk" FOREIGN KEY ("linked_member_id") REFERENCES "public"."customer_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_account_manager_id_employees_id_fk" FOREIGN KEY ("account_manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_from_status_id_order_workflow_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."order_workflow_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_to_status_id_order_workflow_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."order_workflow_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_responsible_department_id_departments_id_fk" FOREIGN KEY ("responsible_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_progress_events" ADD CONSTRAINT "order_progress_events_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_workflow_statuses" ADD CONSTRAINT "order_workflow_statuses_workflow_id_order_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."order_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_workflow_statuses" ADD CONSTRAINT "order_workflow_statuses_default_department_id_departments_id_fk" FOREIGN KEY ("default_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_workflow_transitions" ADD CONSTRAINT "order_workflow_transitions_workflow_id_order_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."order_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_workflow_transitions" ADD CONSTRAINT "order_workflow_transitions_from_status_id_order_workflow_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."order_workflow_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_workflow_transitions" ADD CONSTRAINT "order_workflow_transitions_to_status_id_order_workflow_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."order_workflow_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workflow_id_order_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."order_workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_current_status_id_order_workflow_statuses_id_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."order_workflow_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_department_id_departments_id_fk" FOREIGN KEY ("assigned_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_default_department_id_departments_id_fk" FOREIGN KEY ("default_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_department_id_departments_id_fk" FOREIGN KEY ("assigned_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_order_progress_event_id_order_progress_events_id_fk" FOREIGN KEY ("order_progress_event_id") REFERENCES "public"."order_progress_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_user_purpose" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "idx_employees_dept" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email_active" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_users_type_status" ON "users" USING btree ("user_type","status");--> statement-breakpoint
CREATE INDEX "idx_contacts_customer" ON "contacts" USING btree ("customer_id") WHERE "contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_cust_members_customer" ON "customer_members" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_customers_status_name" ON "customers" USING btree ("status","company_name") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_customers_acct_mgr" ON "customers" USING btree ("account_manager_id");--> statement-breakpoint
CREATE INDEX "idx_order_progress_timeline" ON "order_progress_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_cust_state" ON "orders" USING btree ("customer_id","operational_state","created_at") WHERE "orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_orders_status_expected" ON "orders" USING btree ("current_status_id","expected_completion_date") WHERE "orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_orders_assigned" ON "orders" USING btree ("assigned_employee_id","assigned_department_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_cust_recent" ON "conversations" USING btree ("customer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_messages_conv_cursor" ON "messages" USING btree ("conversation_id","created_at") WHERE "messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tickets_cust_status" ON "tickets" USING btree ("customer_id","status","created_at") WHERE "tickets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tickets_queue" ON "tickets" USING btree ("status","priority","assigned_employee_id") WHERE "tickets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tickets_order" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_order" ON "attachments" USING btree ("order_id") WHERE "attachments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_attachments_ticket" ON "attachments" USING btree ("ticket_id") WHERE "attachments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_attachments_message" ON "attachments" USING btree ("message_id") WHERE "attachments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_attachments_pending_cleanup" ON "attachments" USING btree ("upload_status","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_customer" ON "audit_logs" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_inbox" ON "notifications" USING btree ("recipient_user_id","is_read","created_at");