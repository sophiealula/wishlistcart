// Shared rendering + save logic used by both the popup and the gallery.
import { parsePrice, scrapeProduct } from './lib/scrape.js'
import { classify, CATEGORIES } from './lib/classify.js'
import { getItems, saveItem, removeItem, updateItem } from './storage.js'
import { formatPrice, summarize, countByCategory, filterByCategory } from './lib/items.js'

export const TAB_ORDER = ['all', ...CATEGORIES]
export const LABELS = {
  all: 'All', tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear',
  shoes: 'Shoes', bags: 'Bags', accessories: 'Accessories',
}

// Tracks the active tab filter across re-renders.
const state = { active: 'all' }
let editor = null

function ensureEditor() {
  if (editor) return editor

  const root = document.createElement('div')
  root.className = 'editor-shell'
  root.hidden = true
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `
    <form class="editor-panel" aria-label="Edit saved item">
      <div class="editor-head">
        <div class="editor-title">Edit item</div>
        <button type="button" class="editor-close" data-editor-close aria-label="Close">×</button>
      </div>
      <label>Title<input name="title" required></label>
      <div class="editor-row">
        <label>Brand<input name="brand"></label>
        <label>Price<input name="price" inputmode="decimal"></label>
      </div>
      <div class="editor-row">
        <label>Currency<input name="currency" maxlength="3"></label>
        <label>Category<select name="category"></select></label>
      </div>
      <label>Image URL<input name="image" type="url"></label>
      <label>Product URL<input name="url" type="url"></label>
      <div class="editor-actions">
        <button type="button" class="secondary" data-editor-cancel>Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>`

  const form = root.querySelector('form')
  const fields = form.elements
  for (const key of CATEGORIES) {
    const option = document.createElement('option')
    option.value = key
    option.textContent = LABELS[key]
    fields.category.appendChild(option)
  }

  const close = () => {
    root.hidden = true
    root.setAttribute('aria-hidden', 'true')
    form.onsubmit = null
  }

  root.querySelector('[data-editor-close]').onclick = close
  root.querySelector('[data-editor-cancel]').onclick = close
  root.addEventListener('click', (e) => { if (e.target === root) close() })
  document.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') close() })

  document.body.appendChild(root)
  editor = { root, form, fields, close }
  return editor
}

function openEditor(els, item) {
  const ed = ensureEditor()
  const f = ed.fields
  f.title.value = item.title || ''
  f.brand.value = item.brand || ''
  f.price.value = Number.isFinite(item.price) ? String(item.price) : ''
  f.currency.value = item.currency || 'USD'
  f.category.value = CATEGORIES.includes(item.category) ? item.category : 'accessories'
  f.image.value = item.image || ''
  f.url.value = item.url || ''

  ed.form.onsubmit = async (e) => {
    e.preventDefault()
    const priceText = f.price.value.trim()
    const price = priceText ? parsePrice(priceText) : null
    if (priceText && price == null) {
      showToast(els.toast, 'Enter a valid price')
      f.price.focus()
      return
    }
    try {
      const next = await updateItem(item.id, {
        title: f.title.value,
        brand: f.brand.value,
        price,
        currency: f.currency.value,
        category: f.category.value,
        image: f.image.value,
        url: f.url.value,
      })
      ed.close()
      renderCollection(els, next)
      showToast(els.toast, 'Updated')
    } catch (err) {
      console.error(err)
      showToast(els.toast, 'Could not update item')
    }
  }

  ed.root.hidden = false
  ed.root.setAttribute('aria-hidden', 'false')
  requestAnimationFrame(() => f.title.focus())
}

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
      <div class="card-actions">
        <button class="edit" type="button" title="Edit item" aria-label="Edit item">✎</button>
        <button class="remove" type="button" title="Remove item" aria-label="Remove item">×</button>
      </div>`
    const img = card.querySelector('.thumb')
    if (it.image) img.src = it.image
    img.onerror = () => { img.style.visibility = 'hidden' }
    card.querySelector('.brand').textContent = it.brand || ''
    card.querySelector('.name').textContent = it.title || ''
    card.querySelector('.price').textContent = formatPrice(it.price, it.currency)
    card.querySelector('.edit').onclick = (e) => {
      e.stopPropagation()
      openEditor(els, it)
    }
    card.querySelector('.remove').onclick = async (e) => {
      e.stopPropagation()
      renderCollection(els, await removeItem(it.id))
    }
    card.onclick = () => { if (it.url) chrome.tabs.create({ url: it.url }) }
    els.grid.appendChild(card)
  }
}

export function showToast(el, msg) {
  if (!el) return
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
  data.qty = 1
  return saveItem(data)
}

export { getItems }
