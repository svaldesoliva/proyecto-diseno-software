import { useTranslation } from 'react-i18next'
import type { Product } from '../../../shared/products.ts'
import ProductImage from '../components/ProductImage.tsx'
import ProductOffers from '../components/ProductOffers.tsx'
import ProductSpecifications from '../components/ProductSpecifications.tsx'

export default function ProductDetailPage({ product }: { product: Product }) {
  const { t } = useTranslation()

  return (
    <>
      <header className="page-header">
        <a href="/">← {t('backToCatalog')}</a>
        <h1>{product.name}</h1>
        <p>{product.model ? `${product.brand} · ${product.model}` : product.brand}</p>
      </header>
      <article className="product-detail">
        <div>
          <ProductImage product={product} />
          <ProductOffers offers={product.offers} />
        </div>
        <div>
          <h2>{t('product.specifications')}</h2>
          <ProductSpecifications specifications={product.specifications} />
          <footer className="product-sources">
            <p>{t('product.sources')}</p>
            <ul>
              {product.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                </li>
              ))}
            </ul>
            <small>{t('product.verifiedOn')} <time dateTime={product.verifiedOn}>{product.verifiedOn}</time></small>
          </footer>
        </div>
      </article>
    </>
  )
}
