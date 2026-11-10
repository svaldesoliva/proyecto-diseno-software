import { useTranslation } from 'react-i18next'
import type { ProductSpecifications as Specifications } from '../../../shared/products.ts'

export default function ProductSpecifications({ specifications }: { specifications: Specifications }) {
  const { t } = useTranslation()
  if (Object.keys(specifications).length === 0) return <p>{t('product.noSpecifications')}</p>

  return (
    <dl className="product-specifications">
      {Object.entries(specifications).map(([key, value]) => (
        <div key={key}>
          <dt>{t(`specifications.${key}`, { defaultValue: key })}</dt>
          <dd>{Array.isArray(value) ? value.join(', ') : value ?? t('product.notPublished')}</dd>
        </div>
      ))}
    </dl>
  )
}
