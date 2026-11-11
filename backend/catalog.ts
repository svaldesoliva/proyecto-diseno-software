import type { PriceHistoryPage, Product } from "../shared/products.ts";
import { database } from "./database.ts";
import { productIdFromUrl } from "./scrapers/pcfactory/pcfactory.ts";

export function catalogSnapshot(products: readonly Product[]) {
  if (!products.length) throw new Error("Refusing an empty catalog");
  const keys = new Set<string>();
  return products.map((product) => ({
    ...product,
    offers: product.offers.map((offer) => {
      const url = new URL(offer.url);
      if (
        !/^https?:$/.test(url.protocol) || !offer.store.trim() ||
        !Number.isSafeInteger(offer.priceClp) || offer.priceClp <= 0 ||
        typeof offer.inStock !== "boolean"
      ) {
        throw new Error(`Invalid offer for ${product.id}`);
      }
      const storeId = productIdFromUrl(offer.url);
      url.hash = "";
      // PC Factory's numeric ID survives changes to the product URL's slug.
      const key = storeId === undefined
        ? JSON.stringify([offer.store, url.href])
        : `pcfactory:${storeId}`;
      if (keys.has(key)) throw new Error(`Duplicate offer: ${key}`);
      keys.add(key);
      return { ...offer, key };
    }),
  }));
}

export async function saveCatalog(
  products: readonly Product[],
  observedAt: Date,
) {
  const sql = database();
  const snapshot = catalogSnapshot(products);
  const [result] = await sql<{ saved: boolean }[]>`
    SELECT app_private.save_catalog(${
    JSON.stringify(snapshot)
  }::text::jsonb, ${observedAt}) AS saved`;
  return result.saved;
}

export async function readCatalog(): Promise<Product[]> {
  const sql = database();
  const rows = await sql<{ product: Product }[]>`
    SELECT p.data || jsonb_build_object('offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'store', o.store, 'url', o.url, 'priceClp', o.price_clp, 'inStock', o.in_stock
      ) ORDER BY o.id) FROM app_private.offers o WHERE o.product_id = p.id AND o.active
    ), '[]'::jsonb)) AS product
    FROM app_private.products p WHERE p.active ORDER BY p.id`;
  return rows.map(({ product }) => product);
}

export async function readPriceHistory(
  productId: string,
  before: string | null,
): Promise<PriceHistoryPage> {
  const sql = database();
  const entries = await sql<PriceHistoryPage["entries"]>`
    SELECT h.id::text AS id, o.store, o.url, h.price_clp::float8 AS "priceClp",
      to_char(h.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt"
    FROM app_private.price_history h JOIN app_private.offers o ON o.id = h.offer_id
    WHERE o.product_id = ${productId}
      AND (${before}::bigint IS NULL OR h.id < ${before}::bigint)
    ORDER BY h.id DESC LIMIT 101`;
  return {
    entries: entries.slice(0, 100),
    nextCursor: entries.length > 100 ? entries[99].id : null,
  };
}
