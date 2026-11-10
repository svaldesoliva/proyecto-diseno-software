import { assertEquals, assertRejects } from "@std/assert";
import type { Product } from "../../shared/products.ts";
import {
  type CpuDetails,
  loadCpuDetails,
  mergeCpuDetails,
  scrapeCpuDetails,
} from "./cpu-database.ts";

Deno.test("CPU specifications join by exact model and preserve curated fields and store offers", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (input) => {
    const url = String(input);
    requests.push(url);
    const intel = url.includes("intel");
    const name = intel ? "Intel Core i5-14400F" : "AMD Ryzen 5 5500";
    return Promise.resolve(
      new Response(`
      <h1>${name}<br><span class="cpu_title">Benchmarks &amp; Specs</span></h1>
      <div id="technical-data"><table>
        <tr><td>CPU Cores / Threads</td><td>${
        intel ? "10 / 16" : "6 / 12"
      }</td></tr>
        <tr><td>Architecture</td><td>${
        intel ? "Raptor Lake" : "Zen 3"
      }</td></tr>
        <tr><td>${
        intel ? "Core Cluster 1:" : "Turbo Frequency (1 Core):"
      }</td><td>${intel ? "2.50 - 4.70" : "4.20"} GHz</td></tr>
        <tr><td>${
        intel ? "DDR5-4800<br>DDR4-3200" : "DDR4-3200"
      }</td><td>Bandwidth</td></tr>
      </table></div>`),
    );
  };

  const first: Product = {
    id: "amd-ryzen-5-5500",
    name: "AMD Ryzen 5 5500",
    model: "5500",
    brand: "AMD",
    category: "cpu",
    specifications: { architecture: "Zen 3 (manual)" },
    imageUrl: null,
    verifiedOn: "2026-11-06",
    sources: [],
    offers: [],
  };
  const offer = {
    store: "Other store",
    url: "https://example.com/5500",
    priceClp: 100000,
    inStock: true,
  };
  const products: Product[] = [first, {
    ...first,
    id: "other-5500",
    name: "CPU AMD Ryzen™ 5 5500 (AM4)",
    offers: [offer],
  }, {
    ...first,
    id: "intel-14400f",
    name: "CPU Intel Core i5 14400F",
    model: null,
    brand: "Intel",
    specifications: {},
  }];
  try {
    const details = new Map<string, CpuDetails>();
    await loadCpuDetails(products, details);
    await loadCpuDetails(products, details);
    assertEquals(requests.length, 2);
    const [amd, intel] = mergeCpuDetails(products, details);
    assertEquals(amd.id, first.id);
    assertEquals(amd.offers, [offer]);
    assertEquals(amd.specifications, {
      cores: 6,
      threads: 12,
      architecture: "Zen 3 (manual)",
      maxFrequencyGhz: 4.2,
      memoryTypes: ["DDR4"],
    });
    assertEquals(intel.model, "i5-14400F");
    assertEquals(intel.specifications, {
      cores: 10,
      threads: 16,
      architecture: "Raptor Lake",
      maxFrequencyGhz: 4.7,
      memoryTypes: ["DDR5", "DDR4"],
    });
    await assertRejects(
      () => scrapeCpuDetails("Intel Core i5-14400"),
      Error,
      "unexpected processor",
    );

    let throttledRequests = 0;
    globalThis.fetch = () => {
      throttledRequests++;
      return Promise.resolve(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "3600" },
        }),
      );
    };
    const now = Date.now();
    const retryAt = await loadCpuDetails(products, new Map());
    assertEquals(throttledRequests, 1);
    assertEquals((retryAt ?? 0) >= now + 3600_000, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
