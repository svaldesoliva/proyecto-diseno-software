import type { Product } from "../../../shared/products.ts";
import {
  fetchJson,
  productIdFromUrl,
  productsUrl,
  record,
} from "../pcfactory/pcfactory.ts";

type Gpu = Extract<Product, { category: "gpu" }>;
type Ram = Extract<Product, { category: "ram" }>;
type Details =
  & Pick<Gpu, "name" | "brand" | "imageUrl">
  & {
    model: string;
    source: Product["sources"][number];
  }
  & (
    | Pick<Gpu, "category" | "specifications">
    | Pick<Ram, "category" | "specifications">
  );

export interface PartMatch {
  part: string;
  checkedAt: number;
  details?: Details;
}

function brandKey(value: string) {
  return value.trim().toLowerCase().replace(
    /^kingston(?: fury| technology)$/,
    "kingston",
  )
    .replace(/^xpg$/, "adata").replace(/^hewlett packard enterprise$/, "hpe");
}

function partKey(value: string) {
  return value.toUpperCase().replace(/\s/g, "");
}

export function parseIcecatDetails(
  category: "gpu" | "ram",
  brand: string,
  part: string,
  payload: unknown,
  url: string,
): Details | undefined {
  const data = record(record(payload).data);
  const info = record(data.GeneralInfo);
  const model = info.BrandPartCode;
  const name = info.Title;
  const sourceBrand = info.Brand;
  const categoryId = record(info.Category).CategoryID;
  const gtin = /^\d{12,14}$/.test(part);
  if (
    typeof model !== "string" || !model.trim() || typeof name !== "string" ||
    !name.trim() || typeof sourceBrand !== "string" ||
    brandKey(sourceBrand) !== brandKey(brand) ||
    String(categoryId) !== (category === "gpu" ? "170" : "911") ||
    (partKey(model) !== partKey(part) &&
      !(gtin && Array.isArray(info.GTIN) &&
        info.GTIN.some((code) =>
          typeof code === "string" &&
          code.padStart(14, "0") === part.padStart(14, "0")
        )))
  ) return;

  const fields = new Map<string, string>();
  if (!Array.isArray(data.FeaturesGroups)) return;
  for (const group of data.FeaturesGroups) {
    if (!Array.isArray(group?.Features)) continue;
    for (const feature of group.Features) {
      const key: unknown = feature?.Feature?.Name?.Value;
      const value: unknown = feature?.PresentationValue;
      if (typeof key === "string" && typeof value === "string") {
        fields.set(key, value.trim());
      }
    }
  }
  const image = (data.Image as { Pic500x500?: unknown } | null)?.Pic500x500;
  const common = {
    name,
    brand: sourceBrand,
    model: model.trim(),
    imageUrl: typeof image === "string" &&
        /^https:\/\/images\.icecat\.biz\//.test(image)
      ? image
      : null,
    source: { name: "Icecat", url },
  };
  const number = (label: string, unit = "") => {
    const value = fields.get(label);
    if (!value || !value.endsWith(unit)) return;
    const raw = value.slice(0, value.length - unit.length).trim();
    if (
      /^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) &&
      Number(raw) > 0
    ) {
      return Number(raw);
    }
  };

  if (category === "gpu") {
    const chip = fields.get("Graphics processor");
    if (!chip) return;
    return {
      ...common,
      category,
      specifications: {
        chip,
        memoryGb: number("Discrete graphics card memory", "GB"),
        memoryType: fields.get("Graphics card memory type"),
        interface: fields.get("Interface type"),
        memoryBusBits: number("Memory bus", "bit"),
        memorySpeedGbps: number("Data transfer rate", "Gbit/s"),
      },
    };
  }

  const capacityGb = number("Internal memory", "GB");
  const memoryType = fields.get("Internal memory type");
  if (!capacityGb || !memoryType) return;
  const layout = fields.get("Memory layout (modules x size)")?.match(
    /^(\d+)\s*x\s*(\d+)\s*GB$/i,
  );
  const modules = layout && Number(layout[1]) * Number(layout[2]) === capacityGb
    ? Number(layout[1])
    : undefined;
  const format = fields.get("Memory form factor") ?? "";
  const formFactor = /\bSO[ -]?DIMM\b/i.test(format)
    ? "SODIMM"
    : /\bUDIMM\b/i.test(format) ||
        (format.endsWith(" DIMM") &&
          fields.get("Buffered memory type") === "Unregistered (unbuffered)")
    ? "UDIMM"
    : undefined;
  const profiles = [
    fields.get("Intel Extreme Memory Profile (XMP)") === "Yes" && "XMP",
    fields.get("AMD Extended Profiles for Overclocking (EXPO)") === "Yes" &&
    "EXPO",
  ].filter(Boolean);
  return {
    ...common,
    category,
    specifications: {
      capacityGb,
      modules,
      memoryType,
      speedMtps: number("Memory data transfer rate", "MT/s"),
      formFactor,
      casLatency: number("CAS latency"),
      speedProfile: profiles.length ? profiles.join(" / ") : undefined,
    },
  };
}

export async function loadPartDetails(
  products: readonly Product[],
  matches: Map<string, PartMatch>,
) {
  for (const product of products) {
    if (product.category === "cpu") continue;
    const previous = matches.get(product.id);
    if (
      previous &&
      (previous.details || Date.now() - previous.checkedAt < 86_400_000)
    ) continue;
    let part = previous?.part ?? product.model?.trim();
    try {
      if (!part) {
        const id = [...product.sources, ...product.offers].map(({ url }) =>
          productIdFromUrl(url)
        )
          .find((id) => id !== undefined);
        if (id === undefined) continue;
        // Read the part number solely to identify the product in the technical database.
        const listing = record(await fetchJson(`${productsUrl}/${id}`));
        if (listing.id !== id || typeof listing.partNumber !== "string") {
          continue;
        }
        part = listing.partNumber.trim();
      }
      if (!part || /^(?:n\/a|sin c[oó]digo|s\/c|0|-+)$/i.test(part)) continue;
      const url = new URL("https://live.icecat.biz/api/");
      url.search = new URLSearchParams({
        shopname: "openIcecat-live",
        lang: "en",
        ...(/^\d{12,14}$/.test(part)
          ? { GTIN: part }
          : { Brand: brandKey(product.brand), ProductCode: part }),
      }).toString();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 429) {
        const header = response.headers.get("Retry-After") ?? "";
        const now = Date.now();
        const retry = /^\d+$/.test(header)
          ? now + Number(header) * 1000
          : Date.parse(header);
        return Math.max(now + 30 * 60_000, Number.isFinite(retry) ? retry : 0);
      }
      if (response.status === 404 || response.status === 403) {
        matches.set(product.id, { part, checkedAt: Date.now() });
      } else if (response.ok) {
        const details = parseIcecatDetails(
          product.category,
          product.brand,
          part,
          await response.json(),
          url.href,
        );
        matches.set(product.id, { part, details, checkedAt: Date.now() });
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.warn(
        `Technical fiche unavailable for ${product.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export function mergePartDetails(
  products: readonly Product[],
  matches: ReadonlyMap<string, PartMatch>,
): Product[] {
  const merged = new Map<string, Product>();
  for (const product of products) {
    const match = product.category === "cpu"
      ? undefined
      : matches.get(product.id);
    const details = match?.details;
    const key = match
      ? `${product.category}:${brandKey(product.brand)}:${
        partKey(details?.model ?? match.part)
      }`
      : product.id;
    const existing = merged.get(key);
    let representative = existing ?? product;
    if (details && representative.category === details.category) {
      const { source, ...technical } = details;
      representative = {
        ...representative,
        ...technical,
        name: representative.model ? representative.name : details.name,
        model: representative.model ?? details.model,
        imageUrl: representative.imageUrl ?? details.imageUrl,
        specifications: {
          ...technical.specifications,
          ...representative.specifications,
        },
        sources: representative.sources.some(({ url }) => url === source.url)
          ? representative.sources
          : [...representative.sources, source],
      };
    }
    if (existing) {
      const offers = new Map(
        [...existing.offers, ...product.offers].map((
          offer,
        ) => [offer.url, offer]),
      );
      const sources = new Map(
        [...representative.sources, ...product.sources].map((
          source,
        ) => [source.url, source]),
      );
      representative = {
        ...representative,
        fallbackImageUrl: representative.fallbackImageUrl ??
          product.fallbackImageUrl,
        offers: [...offers.values()],
        sources: [...sources.values()],
      };
    }
    merged.set(key, representative);
  }
  return [...merged.values()];
}
