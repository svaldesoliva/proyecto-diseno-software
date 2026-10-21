import type { Product } from '../../../shared/products.ts'
import ProductImage from './ProductImage.tsx'
import ProductPrice from './ProductPrice.tsx'

export default function ProductCard({ product }: { product: Product }) {
  return (
    <a
      className="product-card"
      href={`/?product=${encodeURIComponent(product.id)}`}
    >
      <ProductImage product={product} />
      <h3>{product.name}</h3>
      <ProductPrice offers={product.offers} />
    </a>
  )
}
