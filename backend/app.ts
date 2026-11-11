import { env } from "node:process";
import { openAuth } from "./auth.ts";
import { readCatalog, readPriceHistory } from "./catalog.ts";
import { handler } from "./main.ts";
import { refreshCatalog } from "./refresh.ts";

let auth: ReturnType<typeof openAuth> | undefined;

export async function application(
  req: Request,
  address: string,
): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (url.pathname === "/api/cron/prices") {
      if (req.method !== "GET") {
        return new Response(null, { status: 405, headers: { Allow: "GET" } });
      }
      if (
        !env.CRON_SECRET ||
        req.headers.get("Authorization") !== `Bearer ${env.CRON_SECRET}`
      ) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json(await refreshCatalog(), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    auth ??= openAuth();
    const response = await auth.route(req, address);
    if (response) return response;
    const history = url.pathname.match(/^\/api\/products\/([^/]+)\/prices$/);
    if (history) {
      if (req.method !== "GET") {
        return new Response(null, { status: 405, headers: { Allow: "GET" } });
      }
      if (!await auth.getUser(req)) {
        return Response.json({ error: "unauthorized" }, {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        });
      }
      const before = url.searchParams.get("before");
      if (
        [...url.searchParams.keys()].some((key) => key !== "before") ||
        (before !== null &&
          (!/^[1-9]\d{0,18}$/.test(before) ||
            BigInt(before) > 9223372036854775807n))
      ) {
        return Response.json({ error: "invalidCursor" }, { status: 400 });
      }
      let id: string;
      try {
        id = decodeURIComponent(history[1]);
      } catch {
        return Response.json({ error: "invalidId" }, { status: 400 });
      }
      return Response.json(await readPriceHistory(id, before), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (!await auth.getUser(req)) {
      return handler(req, [], () => false);
    }
    return handler(req, await readCatalog(), () => true);
  } catch (error) {
    // Do not log connection URLs or database error objects, which may contain credentials.
    const code = error && typeof error === "object" && "code" in error
      ? error.code
      : "";
    console.error(
      "API request failed",
      error instanceof Error ? error.name : "Unknown error",
      typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : "",
    );
    return Response.json({ error: "requestFailed" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
