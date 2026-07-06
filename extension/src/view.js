// Shared rendering + save logic used by both the popup and the gallery.
import { scrapeProduct } from './lib/scrape.js'
import { classify, CATEGORIES } from './lib/classify.js'
import { getItems, saveItem, removeItem } from './storage.js'
import { formatPrice, summarize, countByCategory, filterByCategory } from './lib/items.js'

export const TAB_ORDER = ['all', ...CATEGORIES]
export const LABELS = {
  all: 'All', tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear',
  shoes: 'Shoes', bags: 'Bags', accessories: 'Accessories',
}

// Tracks the active tab filter across re-renders.
const state = { active: 'all' }

// els: { count, total, tabs, grid }
export function renderCollection(els, items) {
  els.count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`
  const { total, currency } = summarize(items)
  els.total.textContent = formatPrice(total, currency)
  const counts = countByCategory(items)

  // If the active filter went empty (e.g. last item removed), fall back to All
  // BEFORE rendering tabs so the All tab picks up the .active highlight.
  if (state.active !== 'all' && counts[state.active] === 0) state.active = 'all'

  els.tabs.innerHTML = ''
  for (const key of TAB_ORDER) {
    if (key !== 'all' && counts[key] === 0) continue // hide empty categories
    const b = document.createElement('button')
    b.textContent = LABELS[key]
    if (key === state.active) b.classList.add('active')
    b.onclick = () => { state.active = key; renderCollection(els, items) }
    els.tabs.appendChild(b)
  }

  els.grid.innerHTML = ''
  const shown = filterByCategory(items, state.active)
  if (!shown.length) {
    els.grid.innerHTML = `<div class="empty">Nothing here yet.<br>Open a product page and save it.</div>`
    return
  }
  for (const it of shown) {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `
      <img class="thumb" alt="">
      <div class="brand"></div>
      <div class="name"></div>
      <div class="price"></div>
      <button class="remove" title="Remove">×</button>`
    const img = card.querySelector('.thumb')
    if (it.image) img.src = it.image
    img.onerror = () => { img.style.visibility = 'hidden' }
    card.querySelector('.brand').textContent = it.brand || ''
    card.querySelector('.name').textContent = it.title || ''
    card.querySelector('.price').textContent = formatPrice(it.price, it.currency)
    card.querySelector('.remove').onclick = async (e) => {
      e.stopPropagation()
      renderCollection(els, await removeItem(it.id))
    }
    card.onclick = () => { if (it.url) chrome.tabs.create({ url: it.url }) }
    els.grid.appendChild(card)
  }
}

export function showToast(el, msg) {
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._toastTimer) // rapid re-toasts shouldn't cut the new one short
  el._toastTimer = setTimeout(() => el.classList.remove('show'), 1600)
}

// Pick the product tab to save: the most-recently-accessed http(s) tab. Works
// from the popup (the product tab is still active) AND the gallery (whose own
// chrome-extension:// tab is correctly skipped).
async function pickTargetTab() {
  const tabs = await chrome.tabs.query({})
  const web = tabs
    .filter((t) => t.url && /^https?:/i.test(t.url))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
  return web[0]
}

// Runs IN the page (isolated world): grabs HTML + picks the largest real product
// image using live naturalWidth/currentSrc, which a detached DOMParser lacks.
function pageGrab() {
  const JUNK = /logo|sprite|icon|badge|placeholder|b-corp|favicon|\.svg(\?|$)/i
  let best = null, bestArea = 0
  for (const img of document.images) {
    let src = img.currentSrc || img.src
    if (!src || src.startsWith('data:') || JUNK.test(src)) continue
    try { src = new URL(src, location.href).href } catch { continue } // absolutize
    const area = img.naturalWidth * img.naturalHeight
    if (area > bestArea && area >= 5000) { bestArea = area; best = src }
  }
  return { html: document.documentElement.outerHTML, url: location.href, image: best }
}

// Scrape the target tab, classify, and save. Returns { added, items } or throws.
export async function saveActiveTab() {
  const tab = await pickTargetTab()
  if (!tab || !tab.id) throw new Error('no product tab')
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: pageGrab,
  })
  const parsed = new DOMParser().parseFromString(result.html, 'text/html')
  const data = scrapeProduct(parsed, { image: result.image })
  data.url = result.url // DOMParser docs carry no location
  data.category = classify(`${data.title} ${data.brand || ''}`)
  return saveItem(data)
}

export { getItems }
