import { assertEquals, assertRejects } from "@std/assert";
import { getPcFactoryProduct } from "./pcfactory.ts";

Deno.test("PC Factory collects product, prices and branch stock separately", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const payloads = {
    product: { id: 46284, nombre: "CPU AMD Ryzen 5 5500 (AM4)" },
    price: { id: 46284, precio: { efectivo: 124990, normal: 128890 } },
    stock: {
      id: 46284,
      disponibilidad: [{
        zona: "Santiago",
        sucursales: [
          { nombre: "Internet", aproximado: "0" },
          { nombre: "Manuel Montt", aproximado: "9" },
        ],
      }],
    },
  };

  globalThis.fetch = (input) => {
    const url = String(input);
    requests.push(url);
    const payload = url.endsWith("/precio")
      ? payloads.price
      : url.endsWith("/stock")
      ? payloads.stock
      : payloads.product;
    return Promise.resolve(Response.json(payload));
  };

  try {
    assertEquals(await getPcFactoryProduct(46284), payloads);
    const baseUrl =
      "https://api.pcfactory.cl/pcfactory-services-catalogo/v1/catalogo/productos/46284";
    assertEquals(requests, [baseUrl, `${baseUrl}/precio`, `${baseUrl}/stock`]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PC Factory rejects failed HTTP requests instead of returning empty data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(null, { status: 403 }));

  try {
    await assertRejects(() => getPcFactoryProduct(46284), Error, "HTTP 403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PC Factory rejects a response that is not JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("<html>Error</html>"));

  try {
    await assertRejects(() => getPcFactoryProduct(46284), SyntaxError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PC Factory rejects invalid product IDs before making requests", async () => {
  for (const productId of [0, -1, 1.5, NaN, Infinity]) {
    await assertRejects(() => getPcFactoryProduct(productId), RangeError);
  }
});
