import { CATEGORIES } from './classify.js'

const SYMBOL = { USD: '$', EUR: '€', GBP: '£' }

export function formatPrice(price, currency = 'USD') {
  if (price == null || !Number.isFinite(price)) return '—'
  const sym = SYMBOL[currency] || ''
  const hasCents = Math.round(price * 100) % 100 !== 0
  const body = price.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${sym}${body}`
}

export function totalValue(items) {
  const sum = items.reduce((acc, it) => acc + (Number.isFinite(it.price) ? it.price : 0), 0)
  return Math.round(sum * 100) / 100
}

export function countByCategory(items) {
  const counts = { all: items.length }
  for (const c of CATEGORIES) counts[c] = 0
  for (const it of items) if (counts[it.category] != null) counts[it.category]++
  return counts
}

export function filterByCategory(items, category) {
  if (category === 'all') return items
  return items.filter((it) => it.category === category)
}
