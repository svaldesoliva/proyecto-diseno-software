import type { Product } from '../../../shared/products.ts'
import ProductImage from '../components/ProductImage.tsx'
import ProductOffers from '../components/ProductOffers.tsx'
import ProductSpecifications from '../components/ProductSpecifications.tsx'

export default function ProductDetailPage({ product }: { product: Product }) {
  return (
    <>
      <header className="page-header">
        <a href="/">← Volver al catálogo</a>
        <h1>{product.name}</h1>
        <p>{product.brand} · {product.model}</p>
      </header>
      <article className="product-detail">
        <div>
          <ProductImage product={product} />
          <ProductOffers offers={product.offers} />
        </div>
        <div>
          <h2>Especificaciones</h2>
          <ProductSpecifications specifications={product.specifications} />
          <footer className="product-sources">
            <p>Fuentes:</p>
            <ul>
              {product.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                </li>
              ))}
            </ul>
            <small>Consulta: <time dateTime={product.verifiedOn}>{product.verifiedOn}</time></small>
          </footer>
        </div>
      </article>
    </>
  )
}
