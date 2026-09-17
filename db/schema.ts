import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const companions = pgTable(
  "companions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull().unique(),
    companionName: text("companion_name").notNull().default("Companion"),
    // ponytail: Phase 2 personality — slug preset bawaan ATAU teks custom user.
    // Default 'balanced'; existing rows otomatis default, tanpa backfill.
    personality: text("personality").notNull().default("balanced"),
    memorySummary: text("memory_summary").notNull().default(""),
    messageCount: integer("message_count").notNull().default(0),
    // ponytail: Phase 9 — penghitung pesan user sejak summary terakhir;
    // trigger regen memorySummary tiap 20 (PRD §15). Bukan duplikat memory.
    messagesSinceSummary: integer("messages_since_summary")
      .notNull()
      .default(0),
    // ponytail: FR-07 journal — hari UTC terakhir ada aktivitas. NULL (baris
    // lama) = dianggap hari ini saat pertama dibaca, tanpa backfill.
    lastActiveDate: date("last_active_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "companions_wallet_lowercase",
      sql`${t.walletAddress} = lower(${t.walletAddress})`
    ),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    // ponytail: urutan total insert. createdAt kembar per pasang (now() per
    // transaksi) + tiebreak id acak = urutan flip habis refresh. seq menutupnya.
    seq: integer("seq").generatedAlwaysAsIdentity(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("chat_messages_role", sql`${t.role} IN ('user', 'companion')`),
    index("idx_chat_messages_companion_created").on(
      t.companionId,
      t.createdAt.desc()
    ),
  ]
);

export type Companion = typeof companions.$inferSelect;
export type NewCompanion = typeof companions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// ponytail: FR-07 journal — 1 entri per companion per hari (PRD §13/§18).
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    highlights: text("highlights").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("journal_entries_companion_entry_unique").on(
      t.companionId,
      t.entryDate
    ),
    index("idx_journal_entries_companion_entry").on(
      t.companionId,
      t.entryDate.desc()
    ),
  ]
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
