import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// ponytail: query via `db` (drizzle). `sql` mentah hanya escape hatch.
// Server-only — jangan import dari client component.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

export const sql = neon(connectionString);
export const db = drizzle(connectionString);
