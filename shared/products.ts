interface ProductSource {
  name: string;
  url: string;
}

export interface ProductOffer {
  store: string;
  priceClp: number;
  url: string;
  inStock: boolean;
}

interface ProductBase {
  id: string;
  name: string;
  brand: string;
  model: string;
  imageUrl: string | null;
  verifiedOn: string;
  sources: ProductSource[];
  offers: ProductOffer[];
}

interface CpuSpecifications {
  series: string;
  family: string;
  architecture: string;
  cores: number;
  threads: number;
  maxFrequencyGhz: number;
  l2CacheMb: number;
  l3CacheMb: number;
  basePowerW: number | null;
  maxPowerW: number | null;
  tdpW?: number;
  socket: string;
  maxMemoryGb: number;
  memoryTypes: string[];
  launchDate: string;
  cpuMarkScore: number;
}

interface GpuSpecifications {
  chip: string;
  memoryGb: number;
  memoryType: string;
  interface: string;
  memoryBusBits: number;
  memorySpeedGbps: number;
}

interface RamSpecifications {
  capacityGb: number;
  modules: number;
  memoryType: string;
  speedMtps: number;
  defaultSpeedMtps: number;
  speedProfile: string;
  formFactor: "UDIMM" | "SODIMM";
  casLatency: number;
}

export type Product =
  & ProductBase
  & (
    | { category: "cpu"; specifications: CpuSpecifications }
    | { category: "gpu"; specifications: GpuSpecifications }
    | { category: "ram"; specifications: RamSpecifications }
  );

export type ProductCategory = Product["category"];
export type ProductSpecifications = Product["specifications"];
