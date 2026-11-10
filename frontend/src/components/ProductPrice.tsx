import { useTranslation } from 'react-i18next'
import type { ProductOffer } from '../../../shared/products.ts'
import { getLowestPrice, priceFormatter } from '../utils/prices.ts'

export default function ProductPrice({ offers }: { offers: ProductOffer[] }) {
  const { t } = useTranslation()
  const lowestPrice = getLowestPrice(offers)

  return (
    <p className="product-price">
      {lowestPrice === null
        ? t('product.priceUnavailable')
        : t('product.priceFrom', { price: priceFormatter.format(lowestPrice) })}
    </p>
  )
}
