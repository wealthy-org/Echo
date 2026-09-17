CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"companion_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"highlights" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_companion_entry_unique" UNIQUE("companion_id","entry_date")
);
--> statement-breakpoint
ALTER TABLE "companions" ADD COLUMN "last_active_date" date;--> statement-breakpoint
CREATE INDEX "idx_journal_entries_companion_entry" ON "journal_entries" ("companion_id","entry_date" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companion_id_companions_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE CASCADE;