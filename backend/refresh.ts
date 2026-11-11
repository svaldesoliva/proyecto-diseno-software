import data from "./data.json" with { type: "json" };
import type { Product } from "../shared/products.ts";
import { readCatalog, saveCatalog } from "./catalog.ts";
import { database } from "./database.ts";
import { loadPcFactoryCatalog } from "./scrapers/pcfactory/catalog-pcfactory.ts";
import {
  loadCpuDetails,
  mergeCpuDetails,
} from "./scrapers/cpu-monkey/cpu-database.ts";
import {
  loadPartDetails,
  mergePartDetails,
} from "./scrapers/icecat/part-database.ts";

export async function refreshCatalog(enrich = false) {
  const observedAt = new Date();
  const previous = new Map(
    (await readCatalog()).map((product) => [product.id, product]),
  );
  // A failed scrape throws before any writes; never record seed prices as live observations.
  const catalog = await loadPcFactoryCatalog(data as Product[]);
  let products = mergeCpuDetails(catalog, new Map()).map((product) => {
    const saved = previous.get(product.id);
    return saved
      ? {
        ...saved,
        ...product,
        model: product.model ?? saved.model,
        imageUrl: product.imageUrl ?? saved.imageUrl,
        specifications: { ...saved.specifications, ...product.specifications },
        sources: [
          ...new Map(
            [...saved.sources, ...product.sources].map((s) => [s.url, s]),
          ).values(),
        ],
      } as Product
      : product;
  });
  const saved = await saveCatalog(products, observedAt);
  if (enrich && saved) {
    const cpuDetails = new Map();
    const partMatches = new Map();
    await loadCpuDetails(products, cpuDetails);
    await loadPartDetails(products, partMatches);
    products = mergeCpuDetails(products, cpuDetails).map((product) =>
      mergePartDetails([product], partMatches)[0]
    );
    // Enrichment updates metadata only; it cannot roll back a newer price refresh.
    const sql = database();
    await sql`UPDATE app_private.products p SET data = item - 'offers'
      FROM jsonb_array_elements(${JSON.stringify(products)}::text::jsonb) AS item
      WHERE p.id = item->>'id'
        AND EXISTS (SELECT 1 FROM app_private.catalog_state WHERE observed_at = ${observedAt})`;
  }
  return {
    products: products.length,
    saved,
    observedAt: observedAt.toISOString(),
  };
}

if (import.meta.main) {
  try {
    console.log(await refreshCatalog(process.argv.includes("--enrich")));
  } finally {
    await database().end();
  }
}
