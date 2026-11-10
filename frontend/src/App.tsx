import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product } from '../../shared/products.ts'
import { getProducts } from './api/products.ts'
import HomePage from './pages/HomePage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import './App.css'

export default function App() {
  const { t, i18n } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const productId = new URLSearchParams(window.location.search).get('product')
  const language = i18n.resolvedLanguage ?? 'es'

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('title')
  }, [language, t])

  useEffect(() => {
    const controller = new AbortController()

    getProducts(controller.signal)
      .then(setProducts)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  let content
  if (loading) {
    content = <p role="status">{t('loading')}</p>
  } else if (error) {
    content = <p role="alert">{t('loadError')}</p>
  } else if (productId) {
    const product = products.find((product) => product.id === productId)
    content = product ? <ProductDetailPage product={product} /> : (
      <>
        <h1>{t('productNotFound')}</h1>
        <a href="/">{t('backToCatalog')}</a>
      </>
    )
  } else {
    content = <HomePage products={products} />
  }

  return (
    <main>
      <label>

        <select value={language} onChange={(event) => { void i18n.changeLanguage(event.target.value) }}>
          <option value="es" lang="es">Español</option>
          <option value="en" lang="en">English</option>
        </select>
      </label>
      {content}
    </main>
  )
}
