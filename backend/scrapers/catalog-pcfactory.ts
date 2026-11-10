import type { Product } from "../../shared/products.ts";
import {
  fetchJson,
  productIdFromUrl,
  productsUrl,
  productUrl,
  record,
} from "./pcfactory.ts";

const categories = { cpu: 272, gpu: 334, ram: 264 } as const;
const store = "PC Factory";

async function listCategory(categoryId: number, onlineOnly: boolean) {
  const products = new Map<number, Record<string, unknown>>();
  let totalPages = 1;
  let totalElements = 0;

  for (let page = 0; page < totalPages; page++) {
    const url = new URL(`${productsUrl}/query`);
    url.searchParams.set("categorias", String(categoryId));
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", "48");
    if (onlineOnly) url.searchParams.set("sucursales", "11,3000");

    const content = record(record(await fetchJson(url)).content);
    const pageable = record(content.pageable);
    const pages = pageable.totalPages;
    const count = pageable.totalElements;
    if (
      !Array.isArray(content.items) || pageable.pageNumber !== page ||
      typeof pages !== "number" || !Number.isSafeInteger(pages) || pages < 0 ||
      typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 ||
      (page > 0 && (pages !== totalPages || count !== totalElements))
    ) {
      throw new Error(`Invalid PC Factory pagination: ${url}`);
    }
    totalPages = pages;
    totalElements = count;
    for (const rawItem of content.items) {
      const item = record(rawItem);
      const id = item.id;
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`Invalid PC Factory product ID: ${url}`);
      }
      products.set(id, item);
    }
  }

  if (products.size !== totalElements) {
    throw new Error(`Incomplete PC Factory category: ${categoryId}`);
  }
  return products;
}

export async function loadPcFactoryCatalog(
  curated: readonly Product[],
): Promise<Product[]> {
  const verifiedOn = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const groups = await Promise.all(
    (Object.keys(categories) as Product["category"][]).map(async (category) => {
      const [published, online] = await Promise.all([
        listCategory(categories[category], false),
        listCategory(categories[category], true),
      ]);
      const products = new Map<number, Product>();
      for (const [id, item] of published) {
        const url = productUrl(id, item.slug);
        const name = item.nombre;
        const brand = item.marca;
        if (
          typeof name !== "string" || !name.trim() || typeof brand !== "string"
        ) {
          throw new Error(`Invalid PC Factory product metadata: ${url}`);
        }
        const priceClp = item.precio == null
          ? undefined
          : record(item.precio).efectivo;
        const thumbnail = item.thumbnail;
        const image = typeof thumbnail === "string" &&
          /^\/public\/foto\/(\d+)\/[\w.-]+\.(?:jpe?g|png|webp|avif)$/i.exec(
            thumbnail,
          );
        products.set(id, {
          id: `pcfactory-${id}`,
          name: name.trim(),
          brand,
          model: null,
          category,
          specifications: {},
          imageUrl: null,
          fallbackImageUrl: image && Number(image[1]) === id
            ? `https://assets.pcfactory.cl${image[0]}`
            : undefined,
          verifiedOn,
          sources: [{ name: store, url }],
          offers:
            typeof priceClp === "number" && Number.isSafeInteger(priceClp) &&
              priceClp > 0
              ? [{ store, url, priceClp, inStock: online.has(id) }]
              : [],
        });
      }
      return products;
    }),
  );

  const published = new Map(groups.flatMap((group) => [...group]));
  if (
    published.size !== groups.reduce((total, group) => total + group.size, 0)
  ) {
    throw new Error("PC Factory listed a product in multiple categories");
  }
  const matched = new Set<string>();
  const merged = curated.map((product) => {
    const match = [...product.sources, ...product.offers].map(({ url }) => {
      const id = productIdFromUrl(url);
      return id === undefined ? undefined : published.get(id);
    }).find((item) => item !== undefined);
    if (match) {
      if (matched.has(match.id) || match.category !== product.category) {
        throw new Error(`Ambiguous PC Factory catalog mapping: ${match.id}`);
      }
      matched.add(match.id);
    }
    return {
      ...product,
      fallbackImageUrl: product.fallbackImageUrl ?? match?.fallbackImageUrl,
      offers: [
        ...product.offers.filter((offer) => offer.store !== store),
        ...(match?.offers ?? []),
      ],
    };
  });

  return [
    ...merged,
    ...[...published.values()].filter((p) => !matched.has(p.id)),
  ];
}
