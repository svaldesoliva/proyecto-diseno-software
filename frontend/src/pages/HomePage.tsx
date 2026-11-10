import { useTranslation } from 'react-i18next'
import type { Product, ProductCategory } from '../../../shared/products.ts'
import ProductSection from '../components/ProductSection.tsx'

const categories: ProductCategory[] = ['cpu', 'gpu', 'ram']

export default function HomePage({ products }: { products: Product[] }) {
  const { t } = useTranslation()

  return (
    <>
      <header className="page-header">
        <h1>{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>
      {products.length === 0 && <p>{t('emptyCatalog')}</p>}
      {products.length > 0 && categories.map((category) => (
        <ProductSection
          key={category}
          category={category}
          title={t(`categories.${category}`)}
          products={products.filter((product) => product.category === category)}
        />
      ))}
    </>
  )
}
