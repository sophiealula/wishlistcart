const KEY = 'wishlist_items'

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref|ref_|_branch|igshid)/i

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
