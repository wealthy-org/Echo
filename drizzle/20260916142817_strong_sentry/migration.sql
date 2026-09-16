-- ponytail: backfill dulu (baris lama dapat NULL bila langsung identity).
-- Urutan backfill: created_at, user-dulu, id — tepat karena 1 transaksi
-- selalu = 1 pasang user+companion dengan created_at identik.
ALTER TABLE "chat_messages" ADD COLUMN "seq" integer;
--> statement-breakpoint
UPDATE "chat_messages" m SET "seq" = t.rn FROM (
  SELECT "id", row_number() OVER (
    ORDER BY "created_at",
      CASE "role" WHEN 'user' THEN 0 ELSE 1 END,
      "id"
  ) AS rn FROM "chat_messages"
) t WHERE m."id" = t."id";
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "seq" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);
