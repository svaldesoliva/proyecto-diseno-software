import type { PriceHistoryPage, Product } from '../../../shared/products.ts'

export async function getPriceHistory(productId: string, before: string | null, signal?: AbortSignal): Promise<PriceHistoryPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/prices${query}`, { signal })
  if (!response.ok) throw new Error(`Price history request failed: ${response.status}`)
  return await response.json()
}

export async function getProducts(signal?: AbortSignal): Promise<Product[] | null> {
  const response = await fetch('/api/products', { signal })

  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(`Product request failed: ${response.status}`)
  }

  const products: unknown = await response.json()
  if (!Array.isArray(products)) {
    throw new Error('Invalid product response')
  }

  return products as Product[]
}
