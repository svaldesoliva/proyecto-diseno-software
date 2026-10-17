import type { Product } from '../../../shared/products.ts'

export async function getProducts(signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch('/api/products', { signal })

  if (!response.ok) {
    throw new Error(`Product request failed: ${response.status}`)
  }

  const products: unknown = await response.json()
  if (!Array.isArray(products)) {
    throw new Error('Invalid product response')
  }

  return products as Product[]
}
