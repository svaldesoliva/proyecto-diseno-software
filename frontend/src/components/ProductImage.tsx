import { useState } from 'react'
import type { Product } from '../../../shared/products.ts'

export default function ProductImage({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="product-image">
      {product.imageUrl && !imageFailed ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : <span>Imagen no disponible</span>}
    </div>
  )
}
