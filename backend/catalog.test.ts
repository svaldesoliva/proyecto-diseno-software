import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "./database.ts";
import type { Product } from "../shared/products.ts";
import data from "./data.json" with { type: "json" };

const db = new PGlite();
const product = (price = 100, inStock = true): Product => ({
  ...data[0] as Product,
  offers: [{
    store: "PC Factory",
    url: "https://www.pcfactory.cl/producto/123-old-slug",
    priceClp: price,
    inStock,
  }],
});
let observation = 0;
async function save(products: Product[]) {
  return await saveCatalog(
    products,
    new Date(1_800_000_000_000 + ++observation * 1000),
  );
}
async function prices() {
  return (await db.query<{ price: number }>(
    "SELECT price_clp::int AS price FROM app_private.price_history ORDER BY id",
  )).rows.map((row) => row.price);
}

// Execute production SQL against PostgreSQL in memory, without a remote test account.
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.reduce(
    (query, part, i) => query + (i ? `$${i}` : "") + part,
    "",
  );
  return (await db.query(text, values)).rows;
}) as unknown as Database;

mock.module(new URL("./database.ts", import.meta.url).href, {
  exports: { database: () => sql },
});
const { catalogSnapshot, readCatalog, readPriceHistory, saveCatalog } =
  await import("./catalog.ts");
const { createAuth } = await import("./auth.ts");
const { application } = await import("./app.ts");
const { importAccounts } = await import("./import-accounts.ts");
const { refreshCatalog } = await import("./refresh.ts");
const { default: vercelEntry } = await import("../api/index.ts");

before(async () => {
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611210001_catalog_price_history.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
beforeEach(async () => {
  observation = 0;
  await db.exec(`TRUNCATE app_private.price_history, app_private.offers,
    app_private.products, app_private.catalog_state, app_private.sessions,
    app_private.local_users, app_private.google_attempts, app_private.login_limits RESTART IDENTITY`);
});
after(() => db.close());

test("records initial price, skips identical observations and stock changes, records A → B → A", async () => {
  await save([product()]);
  await save([product()]);
  await save([product(100, false)]);
  assert.deepEqual(await prices(), [100]);
  await save([product(80)]);
  await save([product(100)]);
  assert.deepEqual(await prices(), [100, 80, 100]);
});

test("stable store ID preserves history when slug or catalog product ID changes", async () => {
  await save([product()]);
  const changed = product(90);
  changed.id = "new-catalog-id";
  changed.offers[0].url = "https://www.pcfactory.cl/producto/123-new-slug";
  await save([changed]);
  assert.deepEqual(await prices(), [100, 90]);
  const offers = await db.query<{ product_id: string }>(
    "SELECT product_id FROM app_private.offers",
  );
  assert.deepEqual(offers.rows, [{ product_id: "new-catalog-id" }]);
});

test("retains missing offers and their history without recording a zero price", async () => {
  await save([product()]);
  const missing = product();
  missing.offers = [];
  await save([missing]);
  assert.deepEqual(await prices(), [100]);
  assert.equal(
    (await db.query<{ active: boolean }>(
      "SELECT active FROM app_private.offers",
    )).rows[0].active,
    false,
  );
  await save([product(90)]);
  assert.deepEqual(await prices(), [100, 90]);
});

test("rolls back the entire snapshot if one offer is invalid", async () => {
  await save([product()]);
  const invalid = catalogSnapshot([product(80)]);
  invalid[0].offers[0].priceClp = -1;
  await assert.rejects(
    db.query(
      "SELECT app_private.save_catalog($1::jsonb, '2100-01-01'::timestamptz)",
      [JSON.stringify(invalid)],
    ),
  );
  assert.deepEqual(await prices(), [100]);
  assert.equal(
    (await db.query<{ price: number }>(
      "SELECT price_clp::int AS price FROM app_private.offers",
    )).rows[0].price,
    100,
  );
});

test("rejects stale snapshots and identical observation retries", async () => {
  await save([product()]);
  await save([product(80)]);
  const stale = await db.query<{ saved: boolean }>(
    "SELECT app_private.save_catalog($1::jsonb, $2::timestamptz) AS saved",
    [
      JSON.stringify(catalogSnapshot([product(200)])),
      new Date(1_800_000_001_000).toISOString(),
    ],
  );
  assert.equal(stale.rows[0].saved, false);
  observation--;
  assert.equal(await save([product(200)]), false);
  assert.deepEqual(await prices(), [100, 80]);
});

test("reads persisted catalog and paginates all price observations without gaps", async () => {
  for (let i = 0; i < 103; i++) await save([product(100 + i)]);
  const catalog = await readCatalog();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].offers[0].priceClp, 202);
  assert.equal(catalog[0].offers[0].inStock, true);
  const first = await readPriceHistory(product().id, null);
  assert.equal(first.entries.length, 100);
  assert.equal(first.entries[0].priceClp, 202);
  assert.equal(typeof first.entries[0].priceClp, "number");
  assert.ok(Number.isFinite(Date.parse(first.entries[0].observedAt)));
  const second = await readPriceHistory(product().id, first.nextCursor);
  assert.deepEqual(second.entries.map((entry) => entry.priceClp), [
    102,
    101,
    100,
  ]);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((entry) => entry.id))
      .size,
    103,
  );
});

test("rejects invalid prices, protocols and duplicate offer identities before writing", () => {
  for (
    const price of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]
  ) {
    assert.throws(() => catalogSnapshot([product(price)]));
  }
  assert.throws(() => catalogSnapshot([]));
  const duplicate = product();
  duplicate.offers.push({
    ...duplicate.offers[0],
    url: "https://www.pcfactory.cl/producto/123-renamed",
  });
  assert.throws(() => catalogSnapshot([duplicate]));
  const invalid = product();
  invalid.offers[0].url = "javascript:alert(1)";
  assert.throws(() => catalogSnapshot([invalid]));
});

test("registration, session across instances, login and revocation persist in PostgreSQL", async () => {
  const origin = new URL("https://catalog.example");
  const first = createAuth(sql, origin);
  const request = (action: string, cookie = "", password = "a-long-password") =>
    new Request(new URL(`/api/auth/${action}`, origin), {
      method: "POST",
      headers: {
        Origin: origin.origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ username: "alice", password }),
    });
  const registered = await first.route(request("register"), "127.0.0.1");
  assert.equal(registered?.status, 201);
  const cookie = registered!.headers.get("set-cookie")!.split(";")[0];
  assert.match(
    registered!.headers.get("set-cookie")!,
    /HttpOnly; SameSite=Lax; Secure/,
  );
  const second = createAuth(sql, origin);
  const session = new Request(origin, { headers: { Cookie: cookie } });
  assert.deepEqual(await second.getUser(session), {
    id: "local:alice",
    name: "alice",
  });
  assert.equal(
    (await second.route(request("register"), "127.0.0.1"))?.status,
    409,
  );
  assert.equal(
    (await second.route(request("login", "", "wrong"), "127.0.0.1"))?.status,
    401,
  );
  assert.equal(
    (await second.route(request("login"), "127.0.0.1"))?.status,
    200,
  );
  assert.equal(
    (await second.route(request("logout", cookie), "127.0.0.1"))?.status,
    204,
  );
  assert.equal(await first.getUser(session), null);
});

test("auth rejects cross-origin requests, wrong methods and shares login rate limits", async () => {
  const origin = new URL("https://catalog.example");
  const auth = createAuth(sql, origin);
  assert.equal(
    (await auth.route(
      new Request(new URL("/api/auth/register", origin), { method: "POST" }),
      "ip",
    ))?.status,
    403,
  );
  assert.equal(
    (await auth.route(new Request(new URL("/api/auth/register", origin)), "ip"))
      ?.status,
    405,
  );
  for (let i = 0; i < 30; i++) {
    assert.equal(
      (await auth.route(
        new Request(new URL("/api/auth/login", origin), {
          method: "POST",
          headers: { Origin: origin.origin },
        }),
        "ip",
      ))?.status,
      400,
    );
  }
  const otherInstance = createAuth(sql, origin);
  assert.equal(
    (await otherInstance.route(
      new Request(new URL("/api/auth/login", origin), {
        method: "POST",
        headers: { Origin: origin.origin },
      }),
      "ip",
    ))?.status,
    429,
  );
});

test("refresh endpoint fails closed without the cron secret", async () => {
  assert.equal(
    (await application(
      new Request("https://catalog.example/api/cron/prices"),
      "ip",
    )).status,
    401,
  );
});

test("API protects history, validates pagination and serves database prices after login", async () => {
  process.env.APP_ORIGIN = "https://catalog.example";
  const historyUrl =
    `https://catalog.example/api/products/${product().id}/prices`;
  assert.equal((await application(new Request(historyUrl), "ip")).status, 401);
  const register = await application(
    new Request("https://catalog.example/api/auth/register", {
      method: "POST",
      headers: {
        Origin: process.env.APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "bob", password: "a-long-password" }),
    }),
    "ip",
  );
  assert.equal(register.status, 201);
  const headers = { Cookie: register.headers.get("set-cookie")!.split(";")[0] };
  await save([product()]);
  await save([product(90)]);
  const response = await application(
    new Request(historyUrl, { headers }),
    "ip",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    (await response.json()).entries.map((entry: { priceClp: number }) =>
      entry.priceClp
    ),
    [90, 100],
  );
  for (
    const query of [
      "before=oops",
      "before=-1",
      "before=9223372036854775808",
      "unknown=true",
    ]
  ) {
    assert.equal(
      (await application(
        new Request(`${historyUrl}?${query}`, { headers }),
        "ip",
      )).status,
      400,
    );
  }
  const catalog = await application(
    new Request("https://catalog.example/api/products?category=cpu", {
      headers,
    }),
    "ip",
  );
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json())[0].offers[0].priceClp, 90);
});

test("a failed source fetch preserves the saved catalog and its history", async () => {
  await save([product()]);
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    () => Promise.reject(new Error("Source unavailable")),
  );
  try {
    await assert.rejects(refreshCatalog());
    assert.deepEqual(await prices(), [100]);
    assert.equal((await readCatalog())[0].offers[0].priceClp, 100);
  } finally {
    fetchMock.mock.restore();
  }
});

test("Vercel adapter removes its rewrite capture while preserving body, session and filters", async () => {
  process.env.APP_ORIGIN = "https://catalog.example";
  await save([product()]);
  const register = await vercelEntry.fetch(new Request("https://catalog.example/api/auth/register?__route=auth/register", {
    method: "POST", headers: { Origin: process.env.APP_ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "adapter", password: "a-long-password" }),
  }));
  assert.equal(register.status, 201);
  const headers = { Cookie: register.headers.get("set-cookie")!.split(";")[0] };
  const products = await vercelEntry.fetch(new Request("https://catalog.example/api/products?__route=products&category=cpu", { headers }));
  assert.equal(products.status, 200);
  assert.equal((await products.json()).length, 1);
  const invalid = await vercelEntry.fetch(new Request("https://catalog.example/api/products?__route=products&path=invalid", { headers }));
  assert.equal(invalid.status, 400);
});

test("RLS denies unprivileged reads even if schema and table access were accidentally granted", async () => {
  await save([product()]);
  try {
    await db.exec(`BEGIN; CREATE ROLE catalog_unprivileged;
      GRANT USAGE ON SCHEMA app_private TO catalog_unprivileged;
      GRANT SELECT ON ALL TABLES IN SCHEMA app_private TO catalog_unprivileged;
      SET LOCAL ROLE catalog_unprivileged;`);
    const result = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM app_private.offers");
    assert.equal(result.rows[0].count, 0);
  } finally {
    await db.exec("ROLLBACK");
  }
});

test("imports legacy accounts without changing SQLite or overwriting an existing username", async () => {
  const directory = await mkdtemp(join(tmpdir(), "catalog-accounts-"));
  const file = join(directory, "accounts.sqlite");
  try {
    const source = new DatabaseSync(file);
    source.exec(
      "CREATE TABLE local_users(username TEXT PRIMARY KEY, salt TEXT, password_hash TEXT)",
    );
    source.prepare("INSERT INTO local_users VALUES (?, ?, ?)").run(
      "legacy",
      "original-salt",
      "original-hash",
    );
    source.close();
    const original = await readFile(file);
    assert.equal(await importAccounts(file, sql), 1);
    await sql`UPDATE app_private.local_users SET salt = 'new-salt' WHERE username = 'legacy'`;
    assert.equal(await importAccounts(file, sql), 0);
    assert.deepEqual(
      (await db.query("SELECT salt FROM app_private.local_users")).rows,
      [{ salt: "new-salt" }],
    );
    assert.deepEqual(await readFile(file), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
