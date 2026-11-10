import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product } from '../../../shared/products.ts'

export default function ProductImage({ product }: { product: Product }) {
  const { t } = useTranslation()
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const src = [product.imageUrl, product.fallbackImageUrl]
    .find((url) => url && !failedUrls.includes(url))

  return (
    <div className="product-image">
      {src ? (
        <img
          key={src}
          src={src}
          alt={product.name}
          loading="lazy"
          onError={() => setFailedUrls((urls) => [...urls, src])}
        />
      ) : <span>{t('product.imageUnavailable')}</span>}
    </div>
  )
}
