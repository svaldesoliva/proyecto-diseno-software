import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProductOffer } from '../../../shared/products.ts'
import { getLowestPrice, priceFormatter } from './prices.ts'

function offer(priceClp: number, inStock = true): ProductOffer {
  return { store: 'Test store', url: 'https://example.com/product', priceClp, inStock }
}

test('the lowest price is selected regardless of the order of offers', () => {
  assert.equal(getLowestPrice([offer(150000), offer(129990), offer(170000)]), 129990)
})

test('out-of-stock offers and invalid prices are excluded', () => {
  assert.equal(getLowestPrice([
    offer(10000, false), offer(0), offer(-100), offer(NaN), offer(Infinity), offer(129990),
  ]), 129990)
})

test('no available prices returns null instead of a zero price', () => {
  assert.equal(getLowestPrice([]), null)
  assert.equal(getLowestPrice([offer(10000, false), offer(0)]), null)
})

test('prices are formatted in Chilean pesos', () => {
  assert.equal(priceFormatter.format(129990), '$129.990')
})
