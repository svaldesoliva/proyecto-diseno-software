import { readFile } from "node:fs/promises";
import { database } from "./database.ts";

const sql = database();
try {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202611210001_catalog_price_history.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await sql.unsafe(migration);
  console.log("Supabase schema created");
} finally {
  await sql.end();
}
