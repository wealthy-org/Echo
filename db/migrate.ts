import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// ponytail: runner migrasi via tsx — `npm run db:migrate`.
async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
