import { assertEquals, assertExists, assertThrows } from "@std/assert";
import type { Product, ProductOffer } from "../../shared/products.ts";
import data from "../data.json" with { type: "json" };
import { toPcFactoryOffer, updatePcFactoryOffer } from "./import-pcfactory.ts";

const result = {
  product: { id: 46284, slug: "46284-amd-cpu-amd-ryzen-5-5500-am4" },
  price: { id: 46284, precio: { efectivo: 124990, normal: 128890 } },
  stock: {
    id: 46284,
    disponibilidad: [{
      sucursales: [
        { id: 11, nombre: "Internet", aproximado: "0", cerrada: false },
        { id: 8, nombre: "Manuel Montt", aproximado: "9", cerrada: false },
      ],
    }],
  },
};

Deno.test("PC Factory uses the cash price and Internet stock only", () => {
  assertEquals(toPcFactoryOffer(46284, result), {
    store: "PC Factory",
    priceClp: 124990,
    url: "https://www.pcfactory.cl/producto/46284-amd-cpu-amd-ryzen-5-5500-am4",
    inStock: false,
  });

  const available = structuredClone(result);
  available.stock.disponibilidad[0].sucursales[0].aproximado = "+30";
  assertEquals(toPcFactoryOffer(46284, available).inStock, true);
  available.stock.disponibilidad[0].sucursales[0].cerrada = true;
  assertEquals(toPcFactoryOffer(46284, available).inStock, false);
});

Deno.test("PC Factory identifies Internet stock by branch ID and prefers branch 3000", () => {
  const available = structuredClone(result);
  const branches = available.stock.disponibilidad[0].sucursales;
  branches[0].nombre = "Despacho web";
  branches[0].aproximado = "5";
  assertEquals(toPcFactoryOffer(46284, available).inStock, true);

  branches.push({ id: 3000, nombre: "CD", aproximado: "-2", cerrada: false });
  assertEquals(toPcFactoryOffer(46284, available).inStock, false);
  branches[2].aproximado = "+30";
  assertEquals(toPcFactoryOffer(46284, available).inStock, true);
});

Deno.test("PC Factory refuses invalid prices instead of overwriting an offer", () => {
  for (const efectivo of [0, -1, 1.5, NaN, Infinity, "124990", null]) {
    assertThrows(
      () =>
        toPcFactoryOffer(46284, {
          ...result,
          price: { id: 46284, precio: { efectivo } },
        }),
      Error,
      "valid cash price",
    );
  }
});

Deno.test("PC Factory refuses mismatched product IDs and invalid URLs", () => {
  for (const key of ["product", "price", "stock"] as const) {
    assertThrows(
      () =>
        toPcFactoryOffer(46284, {
          ...result,
          [key]: { ...result[key], id: 1 },
        }),
      Error,
      "IDs do not match",
    );
  }
  for (
    const slug of [null, "wrong-product", "1-amd", "46284-amd?redirect=other"]
  ) {
    assertThrows(
      () =>
        toPcFactoryOffer(46284, { ...result, product: { id: 46284, slug } }),
      Error,
      "valid product URL",
    );
  }
});

Deno.test("PC Factory refuses unknown or malformed Internet stock", () => {
  const invalidStocks = [
    null,
    { id: 46284, disponibilidad: null },
    { id: 46284, disponibilidad: [] },
    { id: 46284, disponibilidad: [{ sucursales: null }] },
    {
      id: 46284,
      disponibilidad: [{
        sucursales: [{ id: 11, aproximado: "unknown", cerrada: false }],
      }],
    },
    {
      id: 46284,
      disponibilidad: [{
        sucursales: [{
          id: 8,
          nombre: "Internet",
          aproximado: "5",
          cerrada: false,
        }],
      }],
    },
  ];
  for (const stock of invalidStocks) {
    assertThrows(() => toPcFactoryOffer(46284, { ...result, stock }));
  }
});

Deno.test("PC Factory updates one mapped product without duplicates or losing other stores", () => {
  const offer = toPcFactoryOffer(46284, result);
  const anotherStore: ProductOffer = { ...offer, store: "Another store" };
  const products: Product[] = (data as Product[]).map((product) => ({
    ...product,
    offers: product.id === "amd-ryzen-5-5500"
      ? [anotherStore, { ...offer, priceClp: 130000 }, offer]
      : product.offers,
  }));
  const original = structuredClone(products);
  const updated = updatePcFactoryOffer(products, offer);

  assertEquals(updated.length, products.length);
  assertEquals(
    updated.find((product) => product.id === "amd-ryzen-5-5500")?.offers,
    [anotherStore, offer],
  );
  assertEquals(
    updated.filter((product) => product.id !== "amd-ryzen-5-5500"),
    products.filter((product) => product.id !== "amd-ryzen-5-5500"),
  );
  assertEquals(updatePcFactoryOffer(updated, offer), updated);
  assertEquals(products, original);
});

Deno.test("PC Factory can refresh an existing offer whose URL is absent from sources", () => {
  const products = data as Product[];
  const cpu = products.find((product) => product.id === "amd-ryzen-9-9950x");
  assertExists(cpu);
  const offer = { ...cpu.offers[0], priceClp: 600000 };
  assertEquals(
    updatePcFactoryOffer(products, offer).find((product) =>
      product.id === cpu.id
    )
      ?.offers,
    [offer],
  );
  assertThrows(
    () =>
      updatePcFactoryOffer([
        ...products,
        {
          ...cpu,
          sources: [{ name: offer.store, url: offer.url }],
          offers: [],
        },
      ], offer),
    Error,
    "exactly one",
  );
});

Deno.test("PC Factory refuses missing or ambiguous catalog mappings", () => {
  const products = data as Product[];
  const offer = toPcFactoryOffer(46284, result);
  assertThrows(() => updatePcFactoryOffer([], offer), Error, "exactly one");
  assertThrows(
    () => updatePcFactoryOffer([...products, ...products], offer),
    Error,
    "exactly one",
  );
  assertThrows(
    () =>
      updatePcFactoryOffer(products, {
        ...offer,
        url: "https://www.pcfactory.cl/producto/1-other",
      }),
    Error,
    "exactly one",
  );
});
