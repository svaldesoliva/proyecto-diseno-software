import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Product, ProductOffer } from "../../shared/products.ts";
import { getPcFactoryProduct, productUrl, record } from "./pcfactory.ts";

export function toPcFactoryOffer(
  productId: number,
  result: Awaited<ReturnType<typeof getPcFactoryProduct>>,
): ProductOffer {
  const product = record(result.product);
  const price = record(result.price);
  const stock = record(result.stock);
  if ([product, price, stock].some((item) => item.id !== productId)) {
    throw new Error(
      "PC Factory response IDs do not match the requested product",
    );
  }

  const priceClp = record(price.precio).efectivo;
  if (
    typeof priceClp !== "number" || !Number.isSafeInteger(priceClp) ||
    priceClp <= 0
  ) {
    throw new Error("PC Factory did not return a valid cash price");
  }
  const url = productUrl(productId, product.slug);

  if (!Array.isArray(stock.disponibilidad)) {
    throw new Error("PC Factory did not return branch stock");
  }
  const branches = stock.disponibilidad.flatMap((zone) => {
    const branches = record(zone).sucursales;
    if (!Array.isArray(branches)) {
      throw new Error("PC Factory did not return branch stock");
    }
    return branches.map(record);
  });
  // La ficha de PC Factory prioriza la sucursal 3000 para el stock de Internet.
  const internet = branches.find((branch) => branch.id === 3000) ??
    branches.find((branch) => branch.id === 11);
  if (
    !internet || typeof internet.aproximado !== "string" ||
    !/^[+-]?\d+$/.test(internet.aproximado) ||
    typeof internet.cerrada !== "boolean"
  ) {
    throw new Error("PC Factory did not return valid Internet stock");
  }

  return {
    store: "PC Factory",
    priceClp,
    url,
    inStock: !internet.cerrada && Number(internet.aproximado) > 0,
  };
}

export function updatePcFactoryOffer(
  products: Product[],
  offer: ProductOffer,
): Product[] {
  const matches = products.filter((product) =>
    product.sources.some((source) => source.url === offer.url) ||
    product.offers.some((item) =>
      item.store === offer.store && item.url === offer.url
    )
  );
  if (matches.length !== 1) {
    throw new Error(
      "The PC Factory URL must match exactly one catalog product in sources or offers",
    );
  }

  return products.map((product) =>
    product === matches[0]
      ? {
        ...product,
        offers: [
          ...product.offers.filter((item) => item.store !== offer.store),
          offer,
        ],
      }
      : product
  );
}

if (import.meta.main) {
  try {
    const productId = Number(Deno.args[0]);
    const offer = toPcFactoryOffer(
      productId,
      await getPcFactoryProduct(productId),
    );
    const catalogFile = new URL("../data.json", import.meta.url);
    const products = JSON.parse(await Deno.readTextFile(catalogFile));
    if (!Array.isArray(products)) {
      throw new Error("data.json must contain a product array");
    }
    const updated = updatePcFactoryOffer(products, offer);
    const temporaryFile = await Deno.makeTempFile({
      dir: dirname(fileURLToPath(catalogFile)),
      prefix: ".data-",
    });
    try {
      await Deno.writeTextFile(
        temporaryFile,
        JSON.stringify(updated, null, 2) + "\n",
      );
      await Deno.rename(temporaryFile, catalogFile);
    } finally {
      await Deno.remove(temporaryFile).catch((error: unknown) => {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      });
    }
    console.log(JSON.stringify(offer, null, 2));
    console.log("Updated data.json");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
