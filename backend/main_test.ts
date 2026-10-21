import { assertEquals } from "@std/assert";
import type { Product } from "../shared/products.ts";
import { handler } from "./main.ts";

Deno.test("GET /api/products returns two products per category", async () => {
  const response = handler(new Request("http://localhost/api/products"));
  const products: Product[] = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(products.length, 6);
  assertEquals(
    new Set(products.map((product) => product.id)).size,
    6,
  );

  for (const category of ["cpu", "gpu", "ram"]) {
    assertEquals(
      products.filter((product) => product.category === category).length,
      2,
    );
  }

  for (const product of products) {
    assertEquals(Array.isArray(product.offers), true);
    assertEquals(product.sources.length > 0, true);
    assertEquals(Object.keys(product.specifications).length > 0, true);
    for (const source of product.sources) {
      assertEquals(new URL(source.url).protocol, "https:");
    }
  }
});

Deno.test("unknown routes return a JSON 404", async () => {
  const response = handler(new Request("http://localhost/api/missing"));

  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "Not found" });
});

Deno.test("POST /api/products is rejected", async () => {
  const response = handler(
    new Request("http://localhost/api/products", { method: "POST" }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "GET");
  assertEquals(await response.json(), { error: "Method not allowed" });
});
