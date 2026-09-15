CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"companion_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role" CHECK ("role" IN ('user', 'companion'))
);
--> statement-breakpoint
CREATE TABLE "companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_address" text NOT NULL UNIQUE,
	"companion_name" text DEFAULT 'Companion' NOT NULL,
	"memory_summary" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companions_wallet_lowercase" CHECK ("wallet_address" = lower("wallet_address"))
);
--> statement-breakpoint
CREATE INDEX "idx_chat_messages_companion_created" ON "chat_messages" ("companion_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_companion_id_companions_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE CASCADE;