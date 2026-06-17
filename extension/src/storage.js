const KEY = 'wishlist_items'

export async function getItems() {
  const out = await chrome.storage.local.get(KEY)
  return out[KEY] || []
}

export async function saveItem(item) {
  const items = await getItems()
  // De-dupe by url.
  if (item.url && items.some((i) => i.url === item.url)) return { added: false, items }
  const record = { id: crypto.randomUUID(), addedAt: Date.now(), ...item }
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

export async function updateItem(id, patch) {
  const items = await getItems()
  const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
  await chrome.storage.local.set({ [KEY]: next })
  return next
}
