import { useEffect, useState } from 'react'
import type { Product } from '../../shared/products.ts'
import { getProducts } from './api/products.ts'
import HomePage from './pages/HomePage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import './App.css'

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const productId = new URLSearchParams(window.location.search).get('product')

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

  if (loading) return <main><p role="status">Cargando componentes…</p></main>
  if (error) return <main><p role="alert">{error}</p></main>

  if (productId) {
    const product = products.find((product) => product.id === productId)

    if (!product) {
      return (
        <main>
          <h1>Componente no encontrado</h1>
          <a href="/">Volver al catálogo</a>
        </main>
      )
    }

    return <main><ProductDetailPage product={product} /></main>
  }

  return <main><HomePage products={products} /></main>
}
