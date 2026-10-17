import type { ProductSpecifications as Specifications } from '../../../shared/products.ts'

const labels: Record<string, string> = {
  series: 'Serie',
  family: 'Familia',
  architecture: 'Arquitectura',
  cores: 'Núcleos',
  threads: 'Hilos',
  maxFrequencyGhz: 'Frecuencia máxima (GHz)',
  l2CacheMb: 'Caché L2 (MB)',
  l3CacheMb: 'Caché L3 (MB)',
  basePowerW: 'Potencia base (W)',
  maxPowerW: 'Potencia máxima (W)',
  tdpW: 'TDP (W)',
  socket: 'Socket',
  maxMemoryGb: 'Memoria máxima (GB)',
  memoryTypes: 'Tipos de memoria',
  launchDate: 'Lanzamiento',
  cpuMarkScore: 'CPU Mark',
  chip: 'Chip',
  memoryGb: 'Memoria de video (GB)',
  memoryType: 'Tipo de memoria',
  interface: 'Interfaz',
  memoryBusBits: 'Bus de memoria (bits)',
  memorySpeedGbps: 'Velocidad de memoria (Gbps)',
  capacityGb: 'Capacidad total (GB)',
  modules: 'Módulos',
  speedMtps: 'Velocidad (MT/s)',
  defaultSpeedMtps: 'Velocidad predeterminada (MT/s)',
  speedProfile: 'Perfil de velocidad',
  formFactor: 'Formato',
  casLatency: 'Latencia CAS (CL)',
}

export default function ProductSpecifications({ specifications }: { specifications: Specifications }) {
  return (
    <dl className="product-specifications">
      {Object.entries(specifications).map(([key, value]) => (
        <div key={key}>
          <dt>{labels[key] ?? key}</dt>
          <dd>{Array.isArray(value) ? value.join(', ') : value ?? 'No publicado'}</dd>
        </div>
      ))}
    </dl>
  )
}
