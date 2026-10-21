import type { Product, ProductCategory } from '../../../shared/products.ts'
import ProductSection from '../components/ProductSection.tsx'

const categories: { category: ProductCategory; title: string }[] = [
  { category: 'cpu', title: 'Procesadores (CPU)' },
  { category: 'gpu', title: 'Tarjetas gráficas (GPU)' },
  { category: 'ram', title: 'Memorias RAM' },
]

export default function HomePage({ products }: { products: Product[] }) {
  return (
    <>
      <header className="page-header">
        <h1>Catálogo de componentes</h1>
        <p>Compara procesadores, tarjetas gráficas y memorias RAM.</p>
      </header>
      {products.length === 0 && <p>No hay componentes disponibles.</p>}
      {products.length > 0 && categories.map(({ category, title }) => (
        <ProductSection
          key={category}
          category={category}
          title={title}
          products={products.filter((product) => product.category === category)}
        />
      ))}
    </>
  )
}
