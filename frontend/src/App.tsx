import { useEffect, useState } from 'react'
import type { Product, ProductCategory } from '../../shared/products.ts'
import { getProducts } from './api/products.ts'
import ProductSection from './components/ProductSection.tsx'
import './App.css'

const categories: { category: ProductCategory; title: string }[] = [
  { category: 'cpu', title: 'Procesadores (CPU)' },
  { category: 'gpu', title: 'Tarjetas gráficas (GPU)' },
  { category: 'ram', title: 'Memorias RAM' },
]

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    getProducts(controller.signal)
      .then(setProducts)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('No fue posible cargar el catálogo. Inténtalo de nuevo más tarde.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  return (
    <main>
      <header className="page-header">
        <h1>Catálogo de componentes</h1>
        <p>Especificaciones de procesadores, tarjetas gráficas y memorias RAM.</p>
      </header>

      {loading && <p role="status">Cargando componentes…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <p>No hay componentes disponibles.</p>}
      {!loading && !error && products.length > 0 && categories.map(({ category, title }) => (
        <ProductSection
          key={category}
          category={category}
          title={title}
          products={products.filter((product) => product.category === category)}
        />
      ))}
    </main>
  )
}
