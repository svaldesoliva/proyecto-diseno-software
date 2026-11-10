// shortcut: these site endpoints are undocumented, revisit if PC Factory changes them.
export const productsUrl =
  "https://api.pcfactory.cl/pcfactory-services-catalogo/v1/catalogo/productos";

export async function fetchJson(url: string | URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`PC Factory returned HTTP ${response.status}: ${url}`);
  }

  return await response.json();
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Unexpected PC Factory response");
  }
  return value as Record<string, unknown>;
}

export function productUrl(productId: number, slug: unknown): string {
  if (
    typeof slug !== "string" || !/^\d+-[a-z0-9-]+$/.test(slug) ||
    !slug.startsWith(`${productId}-`)
  ) {
    throw new Error("PC Factory did not return a valid product URL");
  }
  return `https://www.pcfactory.cl/producto/${slug}`;
}

export function productIdFromUrl(url: string): number | undefined {
  const id = Number(
    url.match(/^https:\/\/(?:www\.)?pcfactory\.cl\/producto\/(\d+)-/)?.[1],
  );
  if (Number.isSafeInteger(id) && id > 0) return id;
}

export async function getPcFactoryProduct(productId: number) {
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new RangeError("PC Factory product ID must be a positive integer");
  }

  const baseUrl = `${productsUrl}/${productId}`;
  const [product, price, stock] = await Promise.all([
    fetchJson(baseUrl),
    fetchJson(`${baseUrl}/precio`),
    fetchJson(`${baseUrl}/stock`),
  ]);

  return { product, price, stock };
}

if (import.meta.main) {
  try {
    const result = await getPcFactoryProduct(Number(Deno.args[0]));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
