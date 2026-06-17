import { describe, it, expect } from 'vitest'
import { formatPrice, totalValue, summarize, countByCategory, filterByCategory } from '../extension/src/lib/items.js'

const items = [
  { title: 'Tee', price: 285, currency: 'USD', category: 'tops' },
  { title: 'Suitcase', price: 1120.54, currency: 'USD', category: 'bags' },
  { title: 'Cap', price: 40, currency: 'USD', category: 'accessories' },
  { title: 'Mystery', price: null, currency: 'USD', category: 'accessories' },
]

describe('items helpers', () => {
  it('formats price with currency and no trailing cents when whole', () => {
    expect(formatPrice(285, 'USD')).toBe('$285')
    expect(formatPrice(1120.54, 'USD')).toBe('$1,120.54')
    expect(formatPrice(null, 'USD')).toBe('—')
  })
  it('sums total value ignoring null prices', () => {
    expect(totalValue(items)).toBe(1445.54)
  })
  it('counts items per category including All', () => {
    const c = countByCategory(items)
    expect(c.all).toBe(4)
    expect(c.accessories).toBe(2)
    expect(c.tops).toBe(1)
    expect(c.shoes).toBe(0)
  })
  it('filters by category, "all" returns everything', () => {
    expect(filterByCategory(items, 'all').length).toBe(4)
    expect(filterByCategory(items, 'tops').length).toBe(1)
  })
  it('summarize totals a single currency directly', () => {
    expect(summarize(items)).toEqual({ total: 1445.54, currency: 'USD', mixed: false })
  })
  it('summarize totals only the dominant currency when mixed', () => {
    const mixed = [
      { price: 100, currency: 'USD' },
      { price: 50, currency: 'USD' },
      { price: 80, currency: 'EUR' },
    ]
    expect(summarize(mixed)).toEqual({ total: 150, currency: 'USD', mixed: true })
  })
})
