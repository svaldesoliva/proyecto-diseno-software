import { DatabaseSync } from "node:sqlite";
import { type Database, database } from "./database.ts";

export async function importAccounts(file: string | URL, sql: Database) {
  const source = new DatabaseSync(file, { readOnly: true });
  let users;
  try {
    users = source.prepare(
      "SELECT username, salt, password_hash FROM local_users",
    ).all();
  } finally {
    source.close();
  }
  const [result] = await sql<{ imported: number }[]>`
    WITH inserted AS (
      INSERT INTO app_private.local_users(username, salt, password_hash)
      SELECT username, salt, password_hash FROM jsonb_to_recordset(${
    JSON.stringify(users)
  }::text::jsonb)
        AS users(username text, salt text, password_hash text)
      ON CONFLICT (username) DO NOTHING RETURNING 1
    ) SELECT count(*)::int AS imported FROM inserted`;
  return result.imported;
}

if (import.meta.main) {
  const sql = database();
  try {
    console.log(
      "Accounts imported:",
      await importAccounts(
        new URL("./.auth/accounts.sqlite", import.meta.url),
        sql,
      ),
    );
  } finally {
    await sql.end();
  }
}
