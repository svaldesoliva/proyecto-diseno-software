import type { ProductOffer } from '../../../shared/products.ts'
import { priceFormatter } from '../utils/prices.ts'

function getFaviconUrl(productUrl: string) {
  const url = new URL(productUrl)

  if (url.hostname === 'www.pcfactory.cl' || url.hostname === 'pcfactory.cl') {
    return 'https://assets-v3.pcfactory.cl/uploads/6384d0a0-7af5-40ab-940c-0141a8dfdd0a/C32x32/PCFactory_RGB_Isotipo_1.ico'
  }

  // shortcut: other stores use /favicon.ico; add their declared icon URL if needed.
  return new URL('/favicon.ico', url.origin).href
}

export default function ProductOffers({ offers }: { offers: ProductOffer[] }) {
  if (offers.length === 0) return <p>No hay ofertas registradas.</p>

  return (
    <ul className="product-offers" aria-label="Ofertas por tienda">
      {offers.map((offer) => (
        <li key={offer.url}>
          <a className="product-offer" href={offer.url} target="_blank" rel="noopener noreferrer">
            <img
              className="product-offer-icon"
              src={getFaviconUrl(offer.url)}
              alt=""
              width={24}
              height={24}
              onError={(event) => { event.currentTarget.hidden = true }}
            />
            <span className="product-offer-content">
              <span>{offer.store}</span>
              <strong>{priceFormatter.format(offer.priceClp)}</strong>
              {!offer.inStock && <small>Sin stock online</small>}
            </span>
            <span className="product-offer-arrow" aria-hidden="true">↗</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
