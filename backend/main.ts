import type { Product } from "../shared/products.ts";
import data from "./data.json" with { type: "json" };

// shortcut: local product specs are curated, validate them if importing specs automatically.
const products = data as Product[];
const numericFields = new Set(
  products.flatMap((product) =>
    Object.entries(product.specifications)
      .filter(([, value]) => typeof value === "number" || value === null)
      .map(([field]) => field)
  ),
);

export function handler(req: Request): Response {
  const url = new URL(req.url);
  const category = url.pathname.match(
    /^\/api\/products\/category\/(cpu|gpu|ram)$/,
  )?.[1];

  if (url.pathname !== "/api/products" && !category) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  let results = category
    ? products.filter((product) => product.category === category)
    : products;

  for (const [key, rawValue] of url.searchParams) {
    const value = rawValue.trim();
    if (!value) {
      return Response.json({ error: `Invalid filter: ${key}` }, {
        status: 400,
      });
    }

    if (key === "id") {
      results = results.filter((product) => product.id === value);
    } else if (key === "name") {
      results = results.filter((product) =>
        product.name.toLowerCase().includes(value.toLowerCase())
      );
    } else if (key === "category") {
      if (!/^(cpu|gpu|ram)$/.test(value)) {
        return Response.json({ error: "Invalid filter: category" }, {
          status: 400,
        });
      }
      results = results.filter((product) => product.category === value);
    } else {
      const field = key.endsWith("_gt") ? key.slice(0, -3) : "";
      const threshold = Number(value);
      if (!numericFields.has(field) || !Number.isFinite(threshold)) {
        return Response.json({ error: `Invalid filter: ${key}` }, {
          status: 400,
        });
      }

      results = results.filter((product) => {
        const specificationValue: unknown = Reflect.get(
          product.specifications,
          field,
        );
        return typeof specificationValue === "number" &&
          specificationValue > threshold;
      });
    }
  }

  return Response.json(results);
}

if (import.meta.main) {
  Deno.serve(handler);
}
