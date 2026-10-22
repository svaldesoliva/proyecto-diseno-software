import { assertEquals } from "@std/assert";
import type { Product } from "../shared/products.ts";
import { handler } from "./main.ts";

Deno.test("GET /api/products returns the catalog including the PC Factory CPU", async () => {
  const response = handler(new Request("http://localhost/api/products"));
  const products: Product[] = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(products.length, 7);
  assertEquals(
    new Set(products.map((product) => product.id)).size,
    7,
  );

  for (const category of ["cpu", "gpu", "ram"]) {
    assertEquals(
      products.filter((product) => product.category === category).length,
      category === "cpu" ? 3 : 2,
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
  for (
    const path of [
      "/api/missing",
      "/api/products/category/ssd",
      "/api/products/category",
      "/api/products/category/gpu/extra",
    ]
  ) {
    const response = handler(new Request(`http://localhost${path}`));

    assertEquals(response.status, 404);
    assertEquals(await response.json(), { error: "Not found" });
  }
});

Deno.test("POST requests to product routes are rejected", async () => {
  for (const path of ["/api/products", "/api/products/category/gpu"]) {
    const response = handler(
      new Request(`http://localhost${path}`, { method: "POST" }),
    );

    assertEquals(response.status, 405);
    assertEquals(response.headers.get("allow"), "GET");
    assertEquals(await response.json(), { error: "Method not allowed" });
  }
});

for (const category of ["cpu", "gpu", "ram"]) {
  Deno.test(`GET /api/products/category/${category} filters products`, async () => {
    const response = handler(
      new Request(`http://localhost/api/products/category/${category}`),
    );
    const products: Product[] = await response.json();

    assertEquals(response.status, 200);
    assertEquals(products.length, category === "cpu" ? 3 : 2);
    assertEquals(
      products.every((product) => product.category === category),
      true,
    );
  });
}

Deno.test("ID is exact and name supports partial case-insensitive matches", async () => {
  const cases: [string, string[]][] = [
    ["id=intel-core-i9-14900k", ["intel-core-i9-14900k"]],
    ["id=intel", []],
    ["name=RyZeN", ["amd-ryzen-9-9950x", "amd-ryzen-5-5500"]],
    ["name=%20CORE%20i9%20", ["intel-core-i9-14900k"]],
  ];

  for (const [query, expectedIds] of cases) {
    const response = handler(
      new Request(`http://localhost/api/products?${query}`),
    );
    const products: Product[] = await response.json();

    assertEquals(response.status, 200);
    assertEquals(products.map((product) => product.id), expectedIds);
  }
});

Deno.test("numeric filters are strictly greater and exclude missing or null values", async () => {
  const cases: [string, string[]][] = [
    ["cores_gt=16", ["intel-core-i9-14900k"]],
    ["memoryGb_gt=8", []],
    ["capacityGb_gt=8", ["kingston-kf560c36bbe2-16", "kingston-kf432s20ib-16"]],
    ["maxPowerW_gt=0", ["intel-core-i9-14900k"]],
    ["maxFrequencyGhz_gt=5.8", ["intel-core-i9-14900k"]],
  ];

  for (const [query, expectedIds] of cases) {
    const response = handler(
      new Request(`http://localhost/api/products?${query}`),
    );
    const products: Product[] = await response.json();

    assertEquals(response.status, 200);
    assertEquals(products.map((product) => product.id), expectedIds);
  }
});

Deno.test("query and path filters are combined with AND", async () => {
  for (
    const path of [
      "/api/products?category=gpu&name=geforce&memoryGb_gt=4",
      "/api/products/category/gpu?name=geforce&memoryGb_gt=4",
    ]
  ) {
    const response = handler(new Request(`http://localhost${path}`));
    const products: Product[] = await response.json();

    assertEquals(response.status, 200);
    assertEquals(products.map((product) => product.id), [
      "asus-dual-rtx5060-o8g",
    ]);
  }

  const response = handler(
    new Request(
      "http://localhost/api/products?category=gpu&name=radeon&memorySpeedGbps_gt=20",
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), []);
});

Deno.test("invalid, empty and unsupported query filters return 400", async () => {
  for (
    const query of [
      "category=ssd",
      "id=",
      "name=%20",
      "memoryGb_gt=",
      "memoryGb_gt=%20",
      "memoryGb_gt=eight",
      "memoryGb_gt=16foo",
      "memoryGb_gt=Infinity",
      "memoryGb_gt=NaN",
      "memoryGb_gt=1e999",
      "memoryType_gt=3",
      "unknown_gt=8",
      "__proto___gt=8",
      "cores=16",
      "brand=ASUS",
    ]
  ) {
    const response = handler(
      new Request(`http://localhost/api/products?${query}`),
    );
    const key = new URLSearchParams(query).keys().next().value;

    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: `Invalid filter: ${key}` });
  }
});
