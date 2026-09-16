import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// ponytail: query via `db` (drizzle). `sql` mentah hanya escape hatch.
// Pooled driver (bukan neon-http) agar db.transaction tersedia.
// Server-only — jangan import dari client component.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString });

export const sql = neon(connectionString);
export const db = drizzle({ client: pool });
