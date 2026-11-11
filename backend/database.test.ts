import assert from "node:assert/strict";
import { test } from "node:test";
import { X509Certificate } from "node:crypto";
import type { ConnectionOptions } from "node:tls";
import { database } from "./database.ts";

test("uses the Supabase integration's POSTGRES_URL with pooler-compatible TLS settings", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  assert.throws(database, /DATABASE_URL or POSTGRES_URL/);
  process.env.POSTGRES_URL = "postgresql://demo:example@aws-0-us-west-2.pooler.supabase.com:6543/catalog?workaround=supabase-pooler.vercel";
  const sql = database();
  try {
    assert.equal(sql.options.database, "catalog");
    assert.equal(sql.options.prepare, false);
    const tls = sql.options.ssl as ConnectionOptions;
    assert.equal(tls.rejectUnauthorized, true);
    assert.equal(sql.options.max, 1);
    assert.deepEqual(sql.options.port, [5432]);
    assert.equal(Object.hasOwn(sql.options.connection, "workaround"), false);
    const authorities = tls.ca as string[];
    const supabaseCA = new X509Certificate(authorities.at(-1)!);
    assert.equal(supabaseCA.ca, true);
    assert.ok(Date.parse(supabaseCA.validTo) > Date.now());
  } finally {
    await sql.end();
    delete process.env.POSTGRES_URL;
  }
});
