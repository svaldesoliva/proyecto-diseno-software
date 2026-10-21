import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import type { Product } from '../../../shared/products.ts'
import { getProducts } from './products.ts'

afterEach(() => mock.restoreAll())

test('getProducts requests the catalog and forwards its abort signal', async () => {
  const products: Product[] = [{
    id: 'test-ram',
    category: 'ram',
    name: 'Test memory',
    brand: 'Test',
    model: 'TEST-16',
    imageUrl: null,
    verifiedOn: '2026-10-21',
    sources: [{ name: 'Test source', url: 'https://example.com/ram' }],
    offers: [],
    specifications: {
      capacityGb: 16,
      modules: 1,
      memoryType: 'DDR4',
      speedMtps: 3200,
      defaultSpeedMtps: 3200,
      speedProfile: 'Plug and Play',
      formFactor: 'UDIMM',
      casLatency: 20,
    },
  }]
  const controller = new AbortController()
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(products))

  assert.deepEqual(await getProducts(controller.signal), products)
  assert.deepEqual(fetchMock.mock.calls[0].arguments, [
    '/api/products', { signal: controller.signal },
  ])
})

test('getProducts rejects unsuccessful HTTP responses', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))

  await assert.rejects(getProducts(), /503/)
})

test('getProducts rejects a response without a product array', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Hello, world!' }))

  await assert.rejects(getProducts(), /Invalid product response/)
})
