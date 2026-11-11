import { Buffer } from "node:buffer";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { env } from "node:process";
import { type Database, database } from "./database.ts";
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
  sql: Database,
  origin: URL,
  getGoogle?: () => Promise<oidc.Configuration>,
) {
  const secure = origin.protocol === "https:";
  const sessionCookie = secure ? "__Host-session" : "catalog-session";
  const googleCookie = secure ? "__Host-google" : "catalog-google";
  const callback = new URL("/api/auth/google/callback", origin);
  const cookie = (name: string, value: string, seconds: number) =>
    `${name}=${value}; Max-Age=${seconds}; Path=/; HttpOnly; SameSite=Lax${
      secure ? "; Secure" : ""
    }`;

  async function revoke(req: Request) {
    const token = readCookie(req, sessionCookie);
    if (token) {
      await sql`DELETE FROM app_private.sessions WHERE token_hash = ${
        digest(token)
      }`;
    }
  }

  async function startSession(req: Request, id: string, name: string) {
    const token = randomToken();
    const now = Date.now();
    await revoke(req);
    await sql`DELETE FROM app_private.sessions WHERE expires_at <= ${now}`;
    await sql`INSERT INTO app_private.sessions (token_hash, user_id, name, expires_at)
      VALUES (${digest(token)}, ${id}, ${name}, ${
      now + sessionSeconds * 1000
    })`;
    return cookie(sessionCookie, token, sessionSeconds);
  }

  async function getUser(req: Request) {
    const token = readCookie(req, sessionCookie);
    if (!token) return null;
    const [user] = await sql<{ id: string; name: string }[]>`
      SELECT user_id AS id, name FROM app_private.sessions
      WHERE token_hash = ${digest(token)} AND expires_at > ${Date.now()}`;
    return user ?? null;
  }

  let activeHashes = 0;

  async function localLogin(req: Request, register: boolean, address: string) {
    const now = Date.now();
    await sql`DELETE FROM app_private.login_limits WHERE expires_at <= ${now}`;
    const [limit] = await sql<{ attempts: number }[]>`
      INSERT INTO app_private.login_limits(address_hash, attempts, expires_at)
      VALUES (${digest(address)}, 1, ${now + 60_000})
      ON CONFLICT (address_hash) DO UPDATE SET attempts = app_private.login_limits.attempts + 1
      RETURNING attempts`;
    if (limit.attempts > 30 || activeHashes >= 2) {
      return json({ error: "tryLater" }, 429);
    }

    const credentials = await readCredentials(req);
    if (!credentials || credentials.password.length < (register ? 12 : 1)) {
      return json({ error: "invalidInput" }, 400);
    }

    const { username, password } = credentials;
    const [user] = await sql<{ salt: string; password_hash: string }[]>`
      SELECT salt, password_hash FROM app_private.local_users WHERE username = ${username}`;
    const salt = register ? randomToken() : user?.salt ?? "0".repeat(43);
    if (activeHashes >= 2) return json({ error: "tryLater" }, 429);

    activeHashes++;
    try {
      const hash = await passwordHash(password, salt);
      if (register) {
        const result =
          await sql`INSERT INTO app_private.local_users (username, salt, password_hash)
          VALUES (${username}, ${salt}, ${hash.toString("hex")})
          ON CONFLICT(username) DO NOTHING RETURNING username`;
        if (result.length === 0) return json({ error: "usernameTaken" }, 409);
      } else if (
        !user || !timingSafeEqual(hash, Buffer.from(user.password_hash, "hex"))
      ) {
        return json({ error: "invalidCredentials" }, 401);
      }

      const headers = authHeaders();
      headers.append(
        "Set-Cookie",
        await startSession(req, `local:${username}`, username),
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
        await sql`DELETE FROM app_private.google_attempts WHERE expires_at <= ${now}`;
        await sql`INSERT INTO app_private.google_attempts
          (token_hash, state, nonce, verifier, product, expires_at)
          VALUES (${digest(attempt)}, ${state}, ${nonce}, ${verifier},
            ${product ?? null}, ${now + googleSeconds * 1000})`;
        return redirect(authorization, [
          cookie(googleCookie, attempt, googleSeconds),
        ]);
      }

      const attempt = readCookie(req, googleCookie);
      const [pending] = attempt
        ? await sql<
          {
            state: string;
            nonce: string;
            verifier: string;
            product: string | null;
          }[]
        >`
          DELETE FROM app_private.google_attempts WHERE token_hash = ${
          digest(attempt)
        }
          AND state = ${
          url.searchParams.get("state")
        } AND expires_at > ${Date.now()}
          RETURNING state, nonce, verifier, product`
        : [];

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
        await startSession(req, `google:${claims.sub}`, name),
      ]);
    } catch {
      destination.searchParams.set("auth", "google-error");
      return redirect(destination, [clearAttempt]);
    }
  }

  async function route(
    req: Request,
    address: string,
  ): Promise<Response | undefined> {
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
        return json({
          user: await getUser(req),
          googleEnabled: Boolean(getGoogle),
        });
      case "/api/auth/logout": {
        await revoke(req);
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
  const origin = new URL(env.APP_ORIGIN ?? "http://localhost:5173");
  if (
    origin.href !== origin.origin + "/" ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && origin.hostname === "localhost"))
  ) throw new Error("APP_ORIGIN must be an HTTPS origin or http://localhost");

  const id = env.GOOGLE_CLIENT_ID;
  const secret = env.GOOGLE_CLIENT_SECRET;
  if (Boolean(id) !== Boolean(secret)) {
    throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

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
    database(),
    origin,
    getGoogle,
  );
}
