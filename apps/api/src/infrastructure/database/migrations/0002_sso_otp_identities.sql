CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"issuer" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"email_at_link" varchar(255),
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "uq_user_identities_provider_sub" UNIQUE("provider","issuer","subject")
);
--> statement-breakpoint
DROP INDEX "uq_users_email_active";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_identities_user" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_phone_active" ON "users" USING btree ("phone") WHERE "users"."phone" IS NOT NULL AND "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email_active" ON "users" USING btree (lower("email")) WHERE "users"."email" IS NOT NULL AND "users"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";