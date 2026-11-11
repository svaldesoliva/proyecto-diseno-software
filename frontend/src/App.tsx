import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product } from '../../shared/products.ts'
import { getSession, type Session } from './api/auth.ts'
import { getProducts } from './api/products.ts'
import AuthPanel from './components/AuthPanel.tsx'
import HomePage from './pages/HomePage.tsx'
import ProductDetailPage from './pages/ProductDetailPage.tsx'
import './App.css'

export default function App() {
  const { t, i18n } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [googleError, setGoogleError] = useState(() => new URLSearchParams(location.search).get('auth') === 'google-error')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const productId = new URLSearchParams(window.location.search).get('product')
  const language = i18n.resolvedLanguage ?? 'es'
  const userId = session?.user?.id

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('title')
  }, [language, t])

  useEffect(() => {
    const controller = new AbortController()
    getSession(controller.signal).then((result) => {
      if (!controller.signal.aborted) setSession(result)
    }).catch(() => {
      if (!controller.signal.aborted) setSessionError(true)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!googleError) return
    const url = new URL(location.href)
    url.searchParams.delete('auth')
    history.replaceState(history.state, '', url)
  }, [googleError])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()

    getProducts(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result === null) {
          setSession((previous) => previous && { ...previous, user: null })
        } else {
          setProducts(result)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [userId])

  function updateSession(user: Session['user']) {
    setGoogleError(false)
    setProducts([])
    setLoading(true)
    setError(false)
    setSession((previous) => previous && { ...previous, user })
  }

  let content
  if (sessionError) {
    content = <p role="alert">{t('auth.loadError')}</p>
  } else if (!session) {
    content = <p role="status">{t('auth.checkingSession')}</p>
  } else if (!session.user) {
    content = null
  } else if (loading) {
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
      <header className="app-header">
        <label>
          <select aria-label={t('language')} value={language}
            onChange={(event) => { void i18n.changeLanguage(event.target.value) }}>
            <option value="es" lang="es">Español</option>
            <option value="en" lang="en">English</option>
          </select>
        </label>
        {session?.user && <AuthPanel session={session} productId={productId} googleError={false} onChange={updateSession} />}
      </header>
      {session && !session.user && (
        <AuthPanel session={session} productId={productId} googleError={googleError} onChange={updateSession} />
      )}
      {content}
    </main>
  )
}
