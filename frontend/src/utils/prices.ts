import type { ProductOffer } from '../../../shared/products.ts'

export const priceFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export function getLowestPrice(offers: ProductOffer[]): number | null {
  const prices = offers
    .filter((offer) => offer.inStock === true && Number.isFinite(offer.priceClp) && offer.priceClp > 0)
    .map((offer) => offer.priceClp)

  return prices.length > 0 ? Math.min(...prices) : null
}
