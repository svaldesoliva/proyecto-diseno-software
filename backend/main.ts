import type { Product } from "../shared/products.ts";
import data from "./data.json" with { type: "json" };

// shortcut: local JSON is trusted, validate external records when scrapers are added.
const products = data as Product[];

export function handler(req: Request): Response {
  const url = new URL(req.url);

  if (url.pathname !== "/api/products") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  return Response.json(products);
}

if (import.meta.main) {
  Deno.serve(handler);
}
