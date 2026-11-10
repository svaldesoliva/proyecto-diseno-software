import { DomUtils, parseDocument } from "htmlparser2";
import type { Product } from "../../shared/products.ts";

type Cpu = Extract<Product, { category: "cpu" }>;
export type CpuDetails =
  & Pick<Cpu, "name" | "brand" | "model" | "imageUrl" | "specifications">
  & {
    source: Cpu["sources"][number];
  };

class CpuRateLimit extends Error {
  readonly retryAt: number;

  constructor(retryAfter: string | null) {
    super("CPU-Monkey returned HTTP 429");
    const now = Date.now();
    const retry = retryAfter && /^\d+$/.test(retryAfter)
      ? now + Number(retryAfter) * 1000
      : Date.parse(retryAfter ?? "");
    this.retryAt = Math.max(
      now + 30 * 60_000,
      Number.isFinite(retry) ? retry : 0,
    );
  }
}

function nameForLookup(product: Cpu): string {
  // shortcut: PC Factory SKU 57230 omits 250; Intel confirms box code BX80768250KF.
  const shortName = /^CPU Intel Core Ultra 5 KF Plus\b/i.test(product.name);
  const knownUrl =
    "https://www.pcfactory.cl/producto/57230-intel-cpu-intel-core-ultra-5-kf-plus-s1851";
  return shortName && product.sources.some((source) => source.url === knownUrl)
    ? "Intel Core Ultra 5 250KF Plus"
    : product.name;
}

function identifyCpu(name: string) {
  const text = name.replace(/[®™]/g, "");
  const ryzen = /\bAMD\s+Ryzen\s+([3579])\s+(\d{4}(?:[a-z][a-z0-9]{0,3})?)\b/i
    .exec(text);
  if (ryzen) {
    const model = ryzen[2].toUpperCase();
    return { key: `amd_ryzen_${ryzen[1]}_${model.toLowerCase()}`, model };
  }
  const core = /\bIntel\s+Core\s+i([3579])[\s-]+(\d{4,5}[a-z]{0,3})\b/i.exec(
    text,
  );
  if (core) {
    const model = `i${core[1]}-${core[2].toUpperCase()}`;
    return {
      key: `intel_core_${model.toLowerCase().replace("-", "_")}`,
      model,
    };
  }
  const ultra = /\bCore\s+Ultra\s*([579])\b/i.exec(text);
  const ultraNumber = /\b(\d{3}[a-z]{0,3})(?:\s+(Plus))?\b/i.exec(text);
  if (ultra && ultraNumber) {
    const model = ultraNumber[1].toUpperCase() +
      (ultraNumber[2] ? " Plus" : "");
    return {
      key: `intel_core_ultra_${ultra[1]}_${
        model.toLowerCase().replace(" ", "_")
      }`,
      model,
    };
  }
  const celeron = /\bIntel\s+Celeron(?:\s+Processor)?\s+(G\d{4})\b/i.exec(text);
  if (celeron) {
    return {
      key: `intel_celeron_${celeron[1].toLowerCase()}`,
      model: celeron[1].toUpperCase(),
    };
  }
  const xeon = /\bXeon(?:\s+Silver|-S)\s+(\d{4}\+?)(?=\s|$)/i.exec(text);
  if (xeon) {
    return {
      key: `intel_xeon_silver_${xeon[1].replace("+", "_plus")}`,
      model: xeon[1],
    };
  }
}

export async function scrapeCpuDetails(
  name: string,
): Promise<CpuDetails | undefined> {
  const identity = identifyCpu(name);
  if (!identity) return;

  const url = `https://www.cpu-monkey.com/en/cpu-${identity.key}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return;
  if (response.status === 429) {
    throw new CpuRateLimit(response.headers.get("Retry-After"));
  }
  if (!response.ok) {
    throw new Error(`CPU-Monkey HTTP ${response.status}: ${url}`);
  }

  const document = parseDocument(await response.text());
  const heading = DomUtils.findOne(
    (node) => node.name === "h1",
    document.children,
  );
  const title = heading?.children.filter((child) => child.type === "text")
    .map((child) => child.data).join(" ").trim() ?? "";
  const section = DomUtils.findOne(
    (node) => node.attribs.id === "technical-data",
    document.children,
  );
  if (identifyCpu(title)?.key !== identity.key || !section) {
    throw new Error(`CPU-Monkey returned an unexpected processor: ${url}`);
  }

  const fields = new Map<string, string>();
  for (
    const row of DomUtils.findAll(
      (node) => node.name === "tr",
      section.children,
    )
  ) {
    const [label, value] = row.children.filter(DomUtils.isTag);
    if (label?.name !== "td" || value?.name !== "td") continue;
    fields.set(
      DomUtils.textContent(label).trim().replace(/:$/, ""),
      DomUtils.textContent(value).trim(),
    );
  }

  const counts = fields.get("CPU Cores / Threads")?.match(
    /^(\d+)\s*\/\s*(\d+)$/,
  );
  if (
    !counts || Number(counts[1]) < 1 || Number(counts[2]) < Number(counts[1])
  ) {
    throw new Error(`CPU-Monkey returned invalid core counts: ${url}`);
  }
  const specs: Cpu["specifications"] = {
    cores: Number(counts[1]),
    threads: Number(counts[2]),
  };
  const clocks = [...fields].flatMap(([label, value]) =>
    label === "Turbo Frequency (1 Core)" || label.startsWith("Core Cluster ")
      ? [...value.matchAll(/(\d+(?:\.\d+)?)\s*GHz\b/g)].map((match) =>
        Number(match[1])
      )
      : []
  );
  if (clocks.length) specs.maxFrequencyGhz = Math.max(...clocks);

  for (
    const [key, label, unit] of [
      ["l2CacheMb", "L2-Cache", "MB"],
      ["l3CacheMb", "L3-Cache", "MB"],
      ["maxMemoryGb", "Max. Memory", "GB"],
      ["tdpW", "TDP", "W"],
      ["maxPowerW", "TDP (PL2)", "W"],
    ] as const
  ) {
    const value = fields.get(label)?.match(/^(\d+(?:\.\d+)?)\s*(MB|GB|W)$/);
    if (value?.[2] === unit) specs[key] = Number(value[1]);
  }
  for (
    const [key, label] of [
      ["series", "Family"],
      ["family", "CPU group"],
      ["architecture", "Architecture"],
      ["socket", "Socket"],
      ["launchDate", "Release date"],
    ] as const
  ) {
    const value = fields.get(label)?.replace(/\s+\(\d+\)$/, "");
    if (value && value !== "--") specs[key] = value;
  }
  const memory = [...fields.keys()].filter((label) => /^(?:LP)?DDR/.test(label))
    .flatMap((label) => label.match(/(?:LP)?DDR[345]X?/gi) ?? []);
  if (memory.length) {
    specs.memoryTypes = [...new Set(memory.map((type) => type.toUpperCase()))];
  }

  const image = DomUtils.findOne(
    (node) => node.attribs.property === "og:image",
    document.children,
  )?.attribs.content;
  return {
    name: title,
    brand: identity.key.startsWith("amd_") ? "AMD" : "Intel",
    model: identity.model,
    imageUrl: image &&
        /^https:\/\/www\.cpu-monkey\.com\/images\/cpu\/[\w.-]+$/.test(image)
      ? image
      : null,
    specifications: specs,
    source: { name: "CPU-Monkey", url },
  };
}

export async function loadCpuDetails(
  products: readonly Product[],
  details: Map<string, CpuDetails>,
) {
  const pending = new Map<string, string>();
  for (const product of products) {
    if (product.category !== "cpu") continue;
    const name = nameForLookup(product);
    const identity = identifyCpu(name);
    if (identity && !details.has(identity.key)) {
      pending.set(identity.key, name);
    }
  }
  const models = [...pending];
  for (const [index, [key, name]] of models.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const cpu = await scrapeCpuDetails(name);
      if (cpu) details.set(key, cpu);
    } catch (error) {
      if (error instanceof CpuRateLimit) return error.retryAt;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`CPU specifications unavailable for ${name}: ${reason}`);
    }
  }
}

export function mergeCpuDetails(
  products: readonly Product[],
  details: ReadonlyMap<string, CpuDetails>,
) {
  const catalog = new Map<string, Product>();
  for (const product of products) {
    const identity = product.category === "cpu"
      ? identifyCpu(nameForLookup(product))
      : undefined;
    const key = identity?.key ?? product.id;
    const existing = catalog.get(key);
    if (existing) {
      const offers = new Map(
        [...existing.offers, ...product.offers].map((
          offer,
        ) => [offer.url, offer]),
      );
      const sources = new Map(
        [...existing.sources, ...product.sources].map((
          source,
        ) => [source.url, source]),
      );
      catalog.set(key, {
        ...existing,
        fallbackImageUrl: existing.fallbackImageUrl ?? product.fallbackImageUrl,
        offers: [...offers.values()],
        sources: [...sources.values()],
      });
      continue;
    }
    const cpu = identity && details.get(identity.key);
    catalog.set(
      key,
      cpu && product.category === "cpu"
        ? {
          ...product,
          name: product.model ? product.name : cpu.name,
          brand: cpu.brand,
          model: product.model ?? cpu.model,
          imageUrl: product.imageUrl ?? cpu.imageUrl,
          specifications: { ...cpu.specifications, ...product.specifications },
          sources: product.sources.some((source) =>
              source.url === cpu.source.url
            )
            ? product.sources
            : [...product.sources, cpu.source],
        }
        : product,
    );
  }
  return [...catalog.values()];
}

if (import.meta.main) {
  const details = await scrapeCpuDetails(Deno.args.join(" "));
  if (!details) {
    console.error("No exact CPU model found. Example: Intel Core i5-14400F");
    Deno.exit(1);
  }
  console.log(JSON.stringify(details, null, 2));
}
