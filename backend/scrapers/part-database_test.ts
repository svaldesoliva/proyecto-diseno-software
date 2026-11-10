import { assertEquals } from "@std/assert";
import type { Product } from "../../shared/products.ts";
import {
  loadPartDetails,
  mergePartDetails,
  parseIcecatDetails,
  type PartMatch,
} from "./part-database.ts";

function fiche(info: object, fields: Record<string, string>) {
  return {
    data: {
      GeneralInfo: info,
      FeaturesGroups: [{
        Features: Object.entries(fields).map(([name, value]) => ({
          Feature: { Name: { Value: name } },
          PresentationValue: value,
        })),
      }],
    },
  };
}

Deno.test("GPU specifications require the same brand, category and part or barcode", () => {
  const payload = fiche({
    Brand: "MSI",
    BrandPartCode: "RTX 5060 TI VENTUS 8G",
    Title: "MSI RTX 5060 Ti 8 GB",
    Category: { CategoryID: "170" },
    GTIN: ["0824142420997"],
  }, {
    "Graphics processor": "GeForce RTX 5060 Ti",
    "Discrete graphics card memory": "8 GB",
    "Graphics card memory type": "GDDR7",
    "Memory bus": "128 bit",
    "Data transfer rate": "28 Gbit/s",
  });
  const url = "https://live.icecat.biz/api/?GTIN=824142420997";
  const match = parseIcecatDetails("gpu", "MSI", "824142420997", payload, url);
  assertEquals(match?.category, "gpu");
  if (match?.category === "gpu") {
    assertEquals(match.specifications.memoryGb, 8);
    assertEquals(match.specifications.memorySpeedGbps, 28);
  }
  assertEquals(
    parseIcecatDetails("gpu", "MSI", "RTX 5060 TI VENTUS 16G", payload, url),
    undefined,
  );
  assertEquals(
    parseIcecatDetails("gpu", "ASUS", "824142420997", payload, url),
    undefined,
  );
  assertEquals(
    parseIcecatDetails("ram", "MSI", "824142420997", payload, url),
    undefined,
  );
});

Deno.test("automatic RAM lookup joins identical parts and preserves all offers and manual data", async () => {
  const makeProduct = (
    id: number,
    store: string,
    host: string,
    model: string | null,
  ): Product => ({
    id: String(id),
    category: "ram",
    brand: "Kingston FURY",
    name: `RAM ${id}`,
    model,
    imageUrl: null,
    verifiedOn: "2026-11-10",
    specifications: model ? { speedMtps: 6000 } : {},
    sources: [],
    offers: [{
      store,
      url: `https://${host}/producto/${id}-ram`,
      priceClp: id * 1000,
      inStock: true,
    }],
  });
  const curated = makeProduct(1, "Other store", "other.example", "PART-16");
  const identical = makeProduct(2, "PC Factory", "www.pcfactory.cl", null);
  const otherVariant = makeProduct(3, "PC Factory", "www.pcfactory.cl", null);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.pcfactory.cl") {
      const id = Number(url.pathname.split("/").at(-1));
      return Promise.resolve(
        Response.json({
          id,
          partNumber: id === 2 ? "PART-16" : "PART-32",
          speedMtps: 9999,
        }),
      );
    }
    return Promise.resolve(Response.json(fiche({
      Brand: "Kingston Technology",
      BrandPartCode: "PART-16",
      Title: "Kingston 16 GB",
      Category: { CategoryID: "911" },
    }, {
      "Internal memory": "16 GB",
      "Internal memory type": "DDR5",
      "Memory layout (modules x size)": "1 x 16 GB",
      "Memory data transfer rate": "5600 MT/s",
    })));
  };
  try {
    const matches = new Map<string, PartMatch>();
    await loadPartDetails([curated, identical, otherVariant], matches);
    const [first, second] = mergePartDetails(
      [curated, identical, otherVariant],
      matches,
    );
    assertEquals(first.id, curated.id);
    assertEquals(first.offers, [...curated.offers, ...identical.offers]);
    if (first.category === "ram") {
      assertEquals(first.specifications.capacityGb, 16);
      assertEquals(first.specifications.speedMtps, 6000);
    }
    assertEquals(second, otherVariant);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
