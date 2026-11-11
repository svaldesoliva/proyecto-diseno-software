import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PriceHistoryPage } from '../../../shared/products.ts'
import { getPriceHistory } from '../api/products.ts'
import { priceFormatter } from '../utils/prices.ts'

export default function PriceHistory({ productId }: { productId: string }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<PriceHistoryPage | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getPriceHistory(productId, cursor, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setPage((previous) => ({
          ...result,
          entries: cursor ? [...(previous?.entries ?? []), ...result.entries] : result.entries,
        }))
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [productId, cursor, retry])

  function loadPage(before: string | null) {
    setLoading(true)
    setError(false)
    setCursor(before)
    setRetry((value) => value + 1)
  }

  return (
    <section className="price-history" aria-labelledby="price-history-title">
      <h2 id="price-history-title">{t('history.title')}</h2>
      <p>{t('history.description')}</p>
      {page && page.entries.length > 0 && (
        <div className="price-history-scroll">
          <table>
            <thead><tr><th scope="col">{t('history.date')}</th><th scope="col">{t('history.store')}</th><th scope="col">{t('history.price')}</th></tr></thead>
            <tbody>
              {page.entries.map((entry) => (
                <tr key={entry.id}>
                  <td><time dateTime={entry.observedAt}>{new Date(entry.observedAt).toLocaleString(i18n.resolvedLanguage)}</time></td>
                  <td><a href={entry.url} target="_blank" rel="noreferrer">{entry.store}</a></td>
                  <td>{priceFormatter.format(entry.priceClp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && page?.entries.length === 0 && <p>{t('history.empty')}</p>}
      {loading && <p role="status">{t('loading')}</p>}
      {error && <p role="alert">{t('history.error')} <button onClick={() => loadPage(cursor)}>{t('history.retry')}</button></p>}
      {!loading && !error && page?.nextCursor && <button onClick={() => loadPage(page.nextCursor)}>{t('history.more')}</button>}
    </section>
  )
}
