async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`PC Factory returned HTTP ${response.status}: ${url}`);
  }

  return await response.json();
}

export async function getPcFactoryProduct(productId: number) {
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new RangeError("PC Factory product ID must be a positive integer");
  }

  // shortcut: these site endpoints are undocumented, revisit if PC Factory changes them.
  const baseUrl =
    `https://api.pcfactory.cl/pcfactory-services-catalogo/v1/catalogo/productos/${productId}`;
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
