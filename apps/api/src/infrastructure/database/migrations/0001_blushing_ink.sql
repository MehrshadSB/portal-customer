CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"default_locale" varchar(10) DEFAULT 'fa' NOT NULL,
	"enabled_locales" jsonb NOT NULL,
	"calendar_type" varchar(16) DEFAULT 'jalali' NOT NULL,
	"brand_name_fa" varchar(120) DEFAULT 'آذرپارت صنعت' NOT NULL,
	"brand_name_en" varchar(120) DEFAULT 'AzarPart Mfg' NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Tehran';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(10) DEFAULT 'fa' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;