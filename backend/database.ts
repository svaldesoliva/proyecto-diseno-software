import postgres from "postgres";
import { env } from "node:process";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

let connection: ReturnType<typeof postgres> | undefined;

export function database() {
  const value = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!value) throw new Error("DATABASE_URL or POSTGRES_URL is required");
  const url = new URL(value);
  // Vercel's HTTP driver flag is not a PostgreSQL connection parameter.
  url.searchParams.delete("workaround");
  // Postgres.js pipelines queries; Supabase's shared pooler needs session mode.
  if (url.hostname.endsWith(".pooler.supabase.com")) url.port = "5432";
  return connection ??= postgres(url.href, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: {
      rejectUnauthorized: true,
      ca: [
        ...rootCertificates,
        readFileSync(new URL("./supabase-ca.crt", import.meta.url), "utf8"),
      ],
    },
  });
}

export type Database = ReturnType<typeof database>;
