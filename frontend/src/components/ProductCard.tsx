import { useState } from 'react'
import type { Product } from '../../../shared/products.ts'
import ProductSpecifications from './ProductSpecifications.tsx'

export default function ProductCard({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <article className="product-card">
      <div className="product-image">
        {product.imageUrl && !imageFailed ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : <span>Imagen no disponible</span>}
      </div>
      <h3>{product.name}</h3>
      <p className="product-model">{product.brand} · {product.model}</p>
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
    </article>
  )
}
