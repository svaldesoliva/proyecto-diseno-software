import type { Product, ProductCategory } from '../../../shared/products.ts'
import ProductCard from './ProductCard.tsx'

interface ProductSectionProps {
  category: ProductCategory
  title: string
  products: Product[]
}

export default function ProductSection({ category, title, products }: ProductSectionProps) {
  return (
    <section aria-labelledby={category}>
      <h2 id={category}>{title}</h2>
      <div className="product-grid">
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}
