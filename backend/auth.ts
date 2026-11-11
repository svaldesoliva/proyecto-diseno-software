import { Buffer } from "node:buffer";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import * as oidc from "openid-client";

const sessionSeconds = 8 * 60 * 60;
const googleSeconds = 10 * 60;
const randomToken = () => randomBytes(32).toString("base64url");
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const passwordHash = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, {
      N: 2 ** 15,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    }, (error, hash) => error ? reject(error) : resolve(hash));
  });

async function readCredentials(req: Request) {
  const mediaType = req.headers.get("Content-Type")?.split(";")[0].trim();
  if (!req.body || mediaType !== "application/json") return null;

  try {
    const bytes = new Uint8Array(4096);
    let length = 0;
    for await (const chunk of req.body) {
      if (length + chunk.length > bytes.length) return null;
      bytes.set(chunk, length);
      length += chunk.length;
    }

    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, length),
    ));
    if (
      typeof body?.username !== "string" ||
      typeof body?.password !== "string"
    ) return null;

    const username = body.username.trim().toLowerCase();
    const password = body.password;
    if (!/^[a-z0-9_]{3,32}$/.test(username) || password.length > 128) {
      return null;
    }
    return { username, password };
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string {
  const value = req.headers.get("Cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}

function authHeaders() {
  return new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
}

function json(body: unknown, status = 200, headers = authHeaders()) {
  return Response.json(body, { status, headers });
}

function redirect(location: URL, cookies: string[] = []) {
  const headers = authHeaders();
  headers.set("Location", location.href);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export function createAuth(
  db: DatabaseSync,
  origin: URL,
  getGoogle?: () => Promise<oidc.Configuration>,
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_users (
      username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      name TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_attempts (
      token_hash TEXT PRIMARY KEY, state TEXT NOT NULL, nonce TEXT NOT NULL,
      verifier TEXT NOT NULL, product TEXT, expires_at INTEGER NOT NULL
    );
  `);

  const secure = origin.protocol === "https:";
  const sessionCookie = secure ? "__Host-session" : "catalog-session";
  const googleCookie = secure ? "__Host-google" : "catalog-google";
  const callback = new URL("/api/auth/google/callback", origin);
  const cookie = (name: string, value: string, seconds: number) =>
    `${name}=${value}; Max-Age=${seconds}; Path=/; HttpOnly; SameSite=Lax${
      secure ? "; Secure" : ""
    }`;

  function revoke(req: Request) {
    const token = readCookie(req, sessionCookie);
    if (token) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        digest(token),
      );
    }
  }

  function startSession(req: Request, id: string, name: string) {
    const token = randomToken();
    const now = Date.now();
    revoke(req);
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, name, expires_at) VALUES (?, ?, ?, ?)",
    ).run(digest(token), id, name, now + sessionSeconds * 1000);
    return cookie(sessionCookie, token, sessionSeconds);
  }

  function getUser(req: Request) {
    const token = readCookie(req, sessionCookie);
    return token
      ? db.prepare(
        "SELECT user_id AS id, name FROM sessions WHERE token_hash = ? AND expires_at > ?",
      ).get(digest(token), Date.now()) ?? null
      : null;
  }

  // shortcut: each process limits attempts by peer address; use shared limits when scaling behind a proxy.
  const attempts = new Map<string, number>();
  let rateWindow = 0;
  let activeHashes = 0;

  async function localLogin(req: Request, register: boolean, address: string) {
    if (Date.now() >= rateWindow) {
      attempts.clear();
      rateWindow = Date.now() + 60_000;
    }
    const count = attempts.get(address) ?? 0;
    if (count >= 30 || activeHashes >= 2) {
      return json({ error: "tryLater" }, 429);
    }
    attempts.set(address, count + 1);

    const credentials = await readCredentials(req);
    if (!credentials || credentials.password.length < (register ? 12 : 1)) {
      return json({ error: "invalidInput" }, 400);
    }

    const { username, password } = credentials;
    const user = db.prepare(
      "SELECT salt, password_hash FROM local_users WHERE username = ?",
    ).get(username) as { salt: string; password_hash: string } | undefined;
    const salt = register ? randomToken() : user?.salt ?? "0".repeat(43);
    if (activeHashes >= 2) return json({ error: "tryLater" }, 429);

    activeHashes++;
    try {
      const hash = await passwordHash(password, salt);
      if (register) {
        const result = db.prepare(
          "INSERT INTO local_users VALUES (?, ?, ?) ON CONFLICT(username) DO NOTHING",
        ).run(username, salt, hash.toString("hex"));
        if (result.changes === 0) return json({ error: "usernameTaken" }, 409);
      } else if (
        !user || !timingSafeEqual(hash, Buffer.from(user.password_hash, "hex"))
      ) {
        return json({ error: "invalidCredentials" }, 401);
      }

      const headers = authHeaders();
      headers.append(
        "Set-Cookie",
        startSession(req, `local:${username}`, username),
      );
      return json(
        { user: { id: `local:${username}`, name: username } },
        register ? 201 : 200,
        headers,
      );
    } finally {
      activeHashes--;
    }
  }

  async function googleLogin(req: Request, url: URL) {
    const destination = new URL("/", origin);
    const clearAttempt = cookie(googleCookie, "", 0);
    const isCallback = url.pathname === callback.pathname;
    try {
      if (!getGoogle) throw new Error("Google login is disabled");

      if (!isCallback) {
        const product = url.searchParams.get("product")?.slice(0, 256);
        if (product) destination.searchParams.set("product", product);

        const config = await getGoogle();
        const attempt = randomToken();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const verifier = oidc.randomPKCECodeVerifier();
        const authorization = oidc.buildAuthorizationUrl(config, {
          redirect_uri: callback.href,
          scope: "openid profile",
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: "S256",
        });
        const now = Date.now();
        db.prepare("DELETE FROM google_attempts WHERE expires_at <= ?").run(
          now,
        );
        db.prepare("INSERT INTO google_attempts VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            digest(attempt),
            state,
            nonce,
            verifier,
            product ?? null,
            now + googleSeconds * 1000,
          );
        return redirect(authorization, [
          cookie(googleCookie, attempt, googleSeconds),
        ]);
      }

      const attempt = readCookie(req, googleCookie);
      const pending = attempt
        ? db.prepare(
          `DELETE FROM google_attempts WHERE token_hash = ? AND state = ? AND expires_at > ?
         RETURNING state, nonce, verifier, product`,
        ).get(digest(attempt), url.searchParams.get("state"), Date.now()) as
          | {
            state: string;
            nonce: string;
            verifier: string;
            product: string | null;
          }
          | undefined
        : undefined;

      if (!pending) throw new Error("Google login attempt expired or invalid");
      if (pending.product) {
        destination.searchParams.set("product", pending.product);
      }
      const current = new URL(callback);
      current.search = url.search;
      const tokens = await oidc.authorizationCodeGrant(
        await getGoogle(),
        current,
        {
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          pkceCodeVerifier: pending.verifier,
        },
      );
      const claims = tokens.claims();
      if (!claims?.sub) throw new Error("Missing Google identity");
      const name = typeof claims.name === "string" && claims.name.trim()
        ? claims.name.slice(0, 100)
        : "Google";
      return redirect(destination, [
        clearAttempt,
        startSession(req, `google:${claims.sub}`, name),
      ]);
    } catch {
      destination.searchParams.set("auth", "google-error");
      return redirect(destination, [clearAttempt]);
    }
  }

  function route(
    req: Request,
    address: string,
  ): Response | Promise<Response> | undefined {
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/api/auth/")) return;
    const routes = {
      "/api/auth/session": "GET",
      "/api/auth/google": "GET",
      "/api/auth/google/callback": "GET",
      "/api/auth/register": "POST",
      "/api/auth/login": "POST",
      "/api/auth/logout": "POST",
    } as const;
    if (!Object.hasOwn(routes, path)) return json({ error: "notFound" }, 404);

    const method = routes[path as keyof typeof routes];
    if (req.method !== method) {
      const headers = authHeaders();
      headers.set("Allow", method);
      return json({ error: "methodNotAllowed" }, 405, headers);
    }
    if (method === "POST" && req.headers.get("Origin") !== origin.origin) {
      return json({ error: "invalidOrigin" }, 403);
    }

    switch (path) {
      case "/api/auth/session":
        return json({ user: getUser(req), googleEnabled: Boolean(getGoogle) });
      case "/api/auth/logout": {
        revoke(req);
        const headers = authHeaders();
        headers.append("Set-Cookie", cookie(sessionCookie, "", 0));
        return new Response(null, { status: 204, headers });
      }
      case "/api/auth/login":
      case "/api/auth/register":
        return localLogin(req, path === "/api/auth/register", address);
      default:
        return googleLogin(req, new URL(req.url));
    }
  }

  return { route, getUser };
}

export function openAuth() {
  const origin = new URL(Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173");
  if (
    origin.href !== origin.origin + "/" ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && origin.hostname === "localhost"))
  ) throw new Error("APP_ORIGIN must be an HTTPS origin or http://localhost");

  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (Boolean(id) !== Boolean(secret)) {
    throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

  Deno.mkdirSync(".auth", { recursive: true, mode: 0o700 });
  let config: Promise<oidc.Configuration> | undefined;
  const getGoogle = id && secret
    ? () =>
      config ??= oidc.discovery(
        new URL("https://accounts.google.com"),
        id,
        secret,
        oidc.ClientSecretPost(secret),
        { execute: [oidc.enableNonRepudiationChecks] },
      ).catch((error) => {
        config = undefined;
        throw error;
      })
    : undefined;
  return createAuth(
    new DatabaseSync(".auth/accounts.sqlite"),
    origin,
    getGoogle,
  );
}
