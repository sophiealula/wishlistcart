import { CATEGORIES } from './lib/classify.js'
import { parsePrice } from './lib/scrape.js'

const KEY = 'wishlist_items'

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref|ref_|_branch|igshid)/i
const EDITABLE_FIELDS = ['title', 'brand', 'price', 'currency', 'category', 'image', 'url', 'qty', 'color', 'size']

// Normalize a product URL so the same item via tracking/share params de-dupes.
export function normalizeUrl(url) {
  if (!url) return url
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING.test(k)) u.searchParams.delete(k)
    }
    return u.toString()
  } catch {
    return url
  }
}

function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.floor(performance.now()).toString(36)
}

export async function getItems() {
  const out = await chrome.storage.local.get(KEY)
  return out[KEY] || []
}

export async function saveItem(item) {
  const items = await getItems()
  const key = normalizeUrl(item.url)
  if (key && items.some((i) => normalizeUrl(i.url) === key)) return { added: false, items }
  const record = { id: newId(), addedAt: Date.now(), ...item }
  const next = [record, ...items]
  await chrome.storage.local.set({ [KEY]: next })
  return { added: true, item: record, items: next }
}

export async function removeItem(id) {
  const items = await getItems()
  const next = items.filter((i) => i.id !== id)
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

function cleanText(value) {
  if (value == null) return null
  const out = String(value).trim()
  return out || null
}

export function normalizeItemPatch(patch) {
  const out = {}
  for (const key of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const value = patch[key]
    if (key === 'price') {
      out.price = value == null || String(value).trim() === '' ? null : parsePrice(value)
    } else if (key === 'category') {
      if (CATEGORIES.includes(value)) out.category = value
    } else if (key === 'currency') {
      const cleaned = cleanText(value)
      out.currency = cleaned ? cleaned.toUpperCase() : 'USD'
    } else if (key === 'title') {
      out.title = cleanText(value) || 'Untitled item'
    } else if (key === 'qty') {
      const n = parseInt(value, 10)
      out.qty = Number.isFinite(n) && n > 0 ? n : 1
    } else {
      out[key] = cleanText(value)
    }
  }
  return out
}

export async function updateItem(id, patch) {
  const items = await getItems()
  const clean = normalizeItemPatch(patch)
  let changed = false
  const next = items.map((item) => {
    if (item.id !== id) return item
    changed = true
    return { ...item, ...clean, updatedAt: Date.now() }
  })
  if (!changed) return items
  await chrome.storage.local.set({ [KEY]: next })
  return next
}
