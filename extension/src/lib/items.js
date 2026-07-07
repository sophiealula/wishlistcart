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
  const sum = items.reduce((acc, it) => {
    if (!Number.isFinite(it.price)) return acc
    const qty = Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1
    return acc + it.price * qty
  }, 0)
  return Math.round(sum * 100) / 100
}

// Header total. Summing across currencies is meaningless, so when items use more
// than one currency we total only the dominant (most common) one and report it.
export function summarize(items) {
  const priced = items.filter((i) => Number.isFinite(i.price))
  const currencies = [...new Set(priced.map((i) => i.currency || 'USD'))]
  if (currencies.length <= 1) {
    return { total: totalValue(priced), currency: currencies[0] || 'USD', mixed: false }
  }
  const counts = {}
  for (const i of priced) { const c = i.currency || 'USD'; counts[c] = (counts[c] || 0) + 1 }
  const dominant = currencies.sort((a, b) => counts[b] - counts[a])[0]
  return {
    total: totalValue(priced.filter((i) => (i.currency || 'USD') === dominant)),
    currency: dominant,
    mixed: true,
  }
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
