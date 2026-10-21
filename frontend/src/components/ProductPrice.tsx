import type { ProductOffer } from '../../../shared/products.ts'
import { getLowestPrice, priceFormatter } from '../utils/prices.ts'

export default function ProductPrice({ offers }: { offers: ProductOffer[] }) {
  const lowestPrice = getLowestPrice(offers)

  return (
    <p className="product-price">
      {lowestPrice === null ? 'Precio no disponible' : `Desde ${priceFormatter.format(lowestPrice)}`}
    </p>
  )
}
