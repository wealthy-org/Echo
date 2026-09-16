import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
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
