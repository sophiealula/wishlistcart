# WishlistCart Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A web extension (built for Chrome, converted to Safari) that saves products from any site with one click, auto-capturing image/brand/title/price and auto-categorizing them, plus a pixel-matched full-page browsing view to sort saved items by category.

**Architecture:** A single Manifest V3 web extension, no server, no cloud. A content script scrapes the active product page (JSON-LD `Product` → Open Graph → meta fallbacks) and a keyword classifier assigns a category. Items persist in `chrome.storage.local`. The popup is the compact quick-glance view; a bundled full-page view (`gallery.html`, opened in its own tab) is the "website" that pixel-matches the reference screenshot. After it's verified working in Chrome, `safari-web-extension-converter` produces the Safari/Xcode project.

**Tech Stack:** Manifest V3 web extension (vanilla JS, no build step), `chrome.storage.local`, plain HTML/CSS for popup + gallery, Vitest + jsdom for unit tests of the pure logic modules, `safari-web-extension-converter` (full Xcode) for the Safari package.

**Reference layout (from screenshot):** Header with "Saved" + "N items" subtitle on the left, big `$total` on the right, hamburger menu icon. Horizontal category tab bar: Tops · Bottoms · Outerwear · Shoes · Bags (+ "All", "Accessories"). 2-column card grid on white, each card = product photo, small muted-gray brand label, darker product title, price. Floating "+" button. Minimal, lots of whitespace, rounded corners, light-gray dividers.

---

## Conventions

- **No build step for the extension itself** — files load directly. A `package.json` exists only for running tests with Vitest.
- **Pure logic lives in `src/lib/*.js`** as ES modules so it's unit-testable in isolation; the extension loads the same files.
- **TDD for all pure logic** (scraping parse, classifier, totals/formatting). UI (popup/gallery rendering) is verified by running in Chrome, not unit tests.
- **Commit after every passing task.** Casual messages are fine (personal project).
- Run all commands from repo root: `/Users/sophiedavis/projects/personal/one_wishlistcart`.

---

## Task 0: Project scaffold + test harness

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `extension/manifest.json`

**Step 1: Create `package.json`**

```json
{
  "name": "wishlistcart",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "jsdom": "^24.0.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Install deps**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

**Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
```

**Step 4: Create `extension/manifest.json`** (Manifest V3, Chrome-first; Safari-compatible subset)

```json
{
  "manifest_version": 3,
  "name": "WishlistCart",
  "version": "0.1.0",
  "description": "Save products from across the web with a click.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Save to WishlistCart"
  },
  "background": { "service_worker": "background.js" },
  "icons": { "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

**Step 5: Verify test harness runs**

Run: `npm test`
Expected: Vitest runs, reports "No test files found" (exit 0 is fine) — harness works.

**Step 6: Commit**

```bash
git add package.json vitest.config.js extension/manifest.json package-lock.json
git commit -m "scaffold extension + vitest harness"
```

---

## Task 1: Category classifier (pure logic, TDD)

Assigns one of: `tops`, `bottoms`, `outerwear`, `shoes`, `bags`, `accessories` from a product title/text. Keyword-based, deterministic, ordered so more-specific categories win.

**Files:**
- Create: `extension/src/lib/classify.js`
- Test: `tests/classify.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { classify, CATEGORIES } from '../extension/src/lib/classify.js'

describe('classify', () => {
  it('detects tops', () => {
    expect(classify('Floral graphic T-shirt')).toBe('tops')
    expect(classify('Ribbed knit sweater')).toBe('tops')
  })
  it('detects bottoms', () => {
    expect(classify('Slim fit denim jeans')).toBe('bottoms')
    expect(classify('Pleated midi skirt')).toBe('bottoms')
  })
  it('detects outerwear', () => {
    expect(classify('Wool overcoat')).toBe('outerwear')
    expect(classify('Quilted puffer jacket')).toBe('outerwear')
  })
  it('detects shoes', () => {
    expect(classify('Leather chelsea boots')).toBe('shoes')
    expect(classify('Running sneakers')).toBe('shoes')
  })
  it('detects bags', () => {
    expect(classify('Original Check-In M aluminum suitcase')).toBe('bags')
    expect(classify('Leather tote bag')).toBe('bags')
  })
  it('detects accessories', () => {
    expect(classify('Floral graphic baseball cap')).toBe('accessories')
  })
  it('falls back to accessories when unknown', () => {
    expect(classify('Mystery object 3000')).toBe('accessories')
  })
  it('prefers shoes over outerwear when both hint present (boot jacket)', () => {
    // "jacket" hints outerwear but "boots" is more specific footwear
    expect(classify('Rain boots')).toBe('shoes')
  })
  it('exports the canonical category list in display order', () => {
    expect(CATEGORIES).toEqual(['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/classify.test.js`
Expected: FAIL — cannot find module `classify.js`.

**Step 3: Write minimal implementation**

```js
// extension/src/lib/classify.js
export const CATEGORIES = ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories']

// Checked in this order; first category with a keyword hit wins.
// Order matters: shoes & bags before outerwear/tops so "rain boots", "tote bag" win.
const RULES = [
  ['shoes', ['sneaker', 'boot', 'heel', 'loafer', 'sandal', 'shoe', 'trainer', 'pump', 'mule', 'clog', 'derby', 'oxford', 'espadrille']],
  ['bags', ['bag', 'tote', 'backpack', 'suitcase', 'luggage', 'clutch', 'purse', 'satchel', 'duffle', 'duffel', 'crossbody', 'check-in', 'carry-on']],
  ['outerwear', ['coat', 'jacket', 'parka', 'blazer', 'puffer', 'overcoat', 'trench', 'anorak', 'windbreaker', 'cardigan', 'vest']],
  ['bottoms', ['jean', 'trouser', 'pant', 'short', 'skirt', 'legging', 'chino', 'jogger', 'slack', 'culotte']],
  ['tops', ['shirt', 't-shirt', 'tee', 'top', 'blouse', 'sweater', 'sweatshirt', 'hoodie', 'knit', 'polo', 'tank', 'jersey', 'turtleneck']],
  ['accessories', ['cap', 'hat', 'beanie', 'scarf', 'belt', 'glove', 'sunglass', 'watch', 'jewelry', 'necklace', 'ring', 'earring', 'sock', 'wallet', 'tie']],
]

export function classify(text) {
  const t = (text || '').toLowerCase()
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => t.includes(k))) return category
  }
  return 'accessories'
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/classify.test.js`
Expected: PASS (all cases). If "Ribbed knit sweater" or any case fails, adjust keyword ordering — do not delete test cases.

**Step 5: Commit**

```bash
git add extension/src/lib/classify.js tests/classify.test.js
git commit -m "add keyword category classifier"
```

---

## Task 2: Page scraper (pure logic, TDD)

Extracts `{ title, brand, price, currency, image, url }` from an HTML `Document`. Priority: JSON-LD `Product` → Open Graph / meta → DOM heuristics. Pure function takes a `Document` (jsdom in tests, real `document` in the content script).

**Files:**
- Create: `extension/src/lib/scrape.js`
- Test: `tests/scrape.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { scrapeProduct } from '../extension/src/lib/scrape.js'

function doc(html, url = 'https://shop.example.com/p/123') {
  const dom = new JSDOM(html, { url })
  return dom.window.document
}

describe('scrapeProduct', () => {
  it('reads JSON-LD Product first', () => {
    const d = doc(`<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Floral graphic T-shirt",
       "brand":{"@type":"Brand","name":"FACE ROCK"},"image":"https://img/x.jpg",
       "offers":{"@type":"Offer","price":"285.00","priceCurrency":"USD"}}
      </script></head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Floral graphic T-shirt')
    expect(r.brand).toBe('FACE ROCK')
    expect(r.price).toBe(285)
    expect(r.currency).toBe('USD')
    expect(r.image).toBe('https://img/x.jpg')
  })

  it('handles JSON-LD with @graph and array offers', () => {
    const d = doc(`<html><head>
      <script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Original Check-In M",
       "brand":"RIMOWA","image":["https://img/a.jpg","https://img/b.jpg"],
       "offers":[{"price":"1120.00","priceCurrency":"USD"}]}]}
      </script></head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Original Check-In M')
    expect(r.brand).toBe('RIMOWA')
    expect(r.price).toBe(1120)
    expect(r.image).toBe('https://img/a.jpg')
  })

  it('falls back to Open Graph tags', () => {
    const d = doc(`<html><head>
      <meta property="og:title" content="Wool overcoat">
      <meta property="og:image" content="https://img/coat.jpg">
      <meta property="product:price:amount" content="540">
      <meta property="product:price:currency" content="USD">
      <meta property="og:site_name" content="ACME">
      </head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Wool overcoat')
    expect(r.image).toBe('https://img/coat.jpg')
    expect(r.price).toBe(540)
    expect(r.brand).toBe('ACME')
  })

  it('falls back to <title> and largest image when nothing structured', () => {
    const d = doc(`<html><head><title>Plain Tee — Shop</title></head>
      <body><img src="https://img/tee.jpg" width="800" height="800"></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Plain Tee')
    expect(r.image).toBe('https://img/tee.jpg')
  })

  it('parses price strings with currency symbols and commas', () => {
    const d = doc(`<html><head>
      <meta property="og:title" content="Suitcase">
      <meta property="product:price:amount" content="$1,120.54">
      </head><body></body></html>`)
    expect(scrapeProduct(d).price).toBe(1120.54)
  })

  it('always returns the page url', () => {
    const d = doc(`<html><head><title>x</title></head><body></body></html>`,
                  'https://shop.example.com/p/999')
    expect(scrapeProduct(d).url).toBe('https://shop.example.com/p/999')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scrape.test.js`
Expected: FAIL — cannot find module `scrape.js`.

**Step 3: Write minimal implementation**

```js
// extension/src/lib/scrape.js

export function parsePrice(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const cleaned = String(raw).replace(/[^0-9.,]/g, '')
  if (!cleaned) return null
  // Strip thousands commas, keep last dot as decimal.
  const normalized = cleaned.replace(/,/g, '')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

function firstString(v) {
  if (Array.isArray(v)) return firstString(v[0])
  if (v && typeof v === 'object') return v.name || v.url || v['@id'] || null
  return v ?? null
}

function collectProducts(node, out) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((n) => collectProducts(n, out)); return }
  const type = node['@type']
  const isProduct = type === 'Product' ||
    (Array.isArray(type) && type.includes('Product'))
  if (isProduct) out.push(node)
  if (node['@graph']) collectProducts(node['@graph'], out)
}

function fromJsonLd(d) {
  const scripts = [...d.querySelectorAll('script[type="application/ld+json"]')]
  for (const s of scripts) {
    let data
    try { data = JSON.parse(s.textContent) } catch { continue }
    const products = []
    collectProducts(data, products)
    if (!products.length) continue
    const p = products[0]
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers
    return {
      title: firstString(p.name),
      brand: firstString(p.brand),
      image: firstString(p.image),
      price: parsePrice(offer && (offer.price ?? offer.lowPrice)),
      currency: (offer && offer.priceCurrency) || null,
    }
  }
  return null
}

function meta(d, sel) {
  const el = d.querySelector(sel)
  return el ? el.getAttribute('content') : null
}

function fromOpenGraph(d) {
  const title = meta(d, 'meta[property="og:title"]') || meta(d, 'meta[name="twitter:title"]')
  const image = meta(d, 'meta[property="og:image"]') || meta(d, 'meta[name="twitter:image"]')
  const price = meta(d, 'meta[property="product:price:amount"]') ||
                meta(d, 'meta[property="og:price:amount"]')
  const currency = meta(d, 'meta[property="product:price:currency"]') ||
                   meta(d, 'meta[property="og:price:currency"]')
  const brand = meta(d, 'meta[property="og:site_name"]') ||
                meta(d, 'meta[property="product:brand"]')
  if (!title && !image) return null
  return { title, image, price: parsePrice(price), currency, brand }
}

function cleanTitle(t) {
  if (!t) return null
  // Drop trailing "— Site" / "| Site" suffixes.
  return t.split(/\s+[—|–\-]\s+/)[0].trim()
}

function fromDom(d) {
  const title = cleanTitle(d.title) ||
    (d.querySelector('h1') && d.querySelector('h1').textContent.trim())
  let image = null, best = 0
  for (const img of d.querySelectorAll('img')) {
    const w = parseInt(img.getAttribute('width') || '0', 10)
    const h = parseInt(img.getAttribute('height') || '0', 10)
    const area = w * h
    if (img.src && area >= best) { best = area; image = img.src }
  }
  return { title, image, price: null, currency: null, brand: null }
}

export function scrapeProduct(d) {
  const layers = [fromJsonLd(d), fromOpenGraph(d), fromDom(d)].filter(Boolean)
  const pick = (key) => {
    for (const l of layers) if (l[key] != null && l[key] !== '') return l[key]
    return null
  }
  return {
    title: cleanTitle(pick('title')) || pick('title') || 'Untitled item',
    brand: pick('brand'),
    price: pick('price'),
    currency: pick('currency') || 'USD',
    image: pick('image'),
    url: (d.location && d.location.href) || (d.URL) || null,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scrape.test.js`
Expected: PASS. Note: `cleanTitle` runs both inside `fromDom` and again in `scrapeProduct`; double-cleaning is idempotent for these cases. If the OG-brand test fails because DOM title overrode it, confirm `pick` iterates layers in [jsonld, og, dom] order.

**Step 5: Commit**

```bash
git add extension/src/lib/scrape.js tests/scrape.test.js
git commit -m "add product scraper (json-ld → og → dom)"
```

---

## Task 3: Store helpers — totals & formatting (pure logic, TDD)

Pure helpers the popup and gallery share: format a price, compute the collection total, count items, filter by category.

**Files:**
- Create: `extension/src/lib/items.js`
- Test: `tests/items.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { formatPrice, totalValue, countByCategory, filterByCategory } from '../extension/src/lib/items.js'

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
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/items.test.js`
Expected: FAIL — cannot find module `items.js`.

**Step 3: Write minimal implementation**

```js
// extension/src/lib/items.js
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/items.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/src/lib/items.js tests/items.test.js
git commit -m "add price/total/filter helpers"
```

---

## Task 4: Storage layer (thin wrapper over chrome.storage.local)

Not unit-tested (browser API); kept tiny and obvious. Generates ids without `Math.random` reliance issues by using `crypto.randomUUID()` (available in extension contexts).

**Files:**
- Create: `extension/src/storage.js`

**Step 1: Implement**

```js
// extension/src/storage.js
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
```

**Step 2: Commit**

```bash
git add extension/src/storage.js
git commit -m "add chrome.storage.local layer"
```

---

## Task 5: Background service worker + content scrape injection

When the toolbar icon is clicked the popup opens (Task 6). Saving happens by injecting a scrape into the active tab. Background exposes a message handler the popup calls to scrape + save the current tab.

**Files:**
- Create: `extension/background.js`
- Create: `extension/content-scrape.js`

**Step 1: Implement `content-scrape.js`** (runs in page context via `scripting.executeScript`, returns raw fields — it cannot import ES modules, so it inlines a minimal scrape that mirrors `scrape.js`; the rich parsing is re-done in the popup using the real module against a re-hydrated DOM is overkill, so we scrape here and pass structured data out)

```js
// content-scrape.js — injected function body. Returns the page's outerHTML + url
// so the popup can run the full scrapeProduct() module on it via DOMParser.
(() => ({
  html: document.documentElement.outerHTML,
  url: location.href,
}))()
```

**Step 2: Implement `background.js`**

```js
// background.js
// Minimal: the popup drives scraping directly via chrome.scripting from its own
// context, so background only needs to exist for MV3. Kept as a no-op listener
// to keep the service worker registered.
chrome.runtime.onInstalled.addListener(() => {})
```

**Step 3: Commit**

```bash
git add extension/background.js extension/content-scrape.js
git commit -m "add background worker + page html grabber"
```

> Note for executor: The popup (Task 6) will call `chrome.scripting.executeScript({target,func})` to pull `document.documentElement.outerHTML` + `location.href`, then parse it with `DOMParser` and run `scrapeProduct()` on the parsed doc. This reuses the tested module verbatim. `scrapeProduct` reads `d.location?.href || d.URL`; for `DOMParser` docs neither is set, so the popup overrides `url` with the value returned from the page.

---

## Task 6: Popup — compact saved view + Save button

The popup shows the current saved collection compactly AND a primary "Save this page" button. Matches the screenshot's popup styling (header with "Saved" + count, `$total`, category tabs, 2-col grid).

**Files:**
- Create: `extension/popup.html`
- Create: `extension/popup.js`
- Create: `extension/styles.css` (shared by popup + gallery)

**Step 1: Implement `styles.css`** — shared design tokens matching the reference

```css
/* styles.css — shared by popup + gallery */
:root {
  --bg: #ffffff;
  --ink: #111111;
  --muted: #9a9a9a;
  --line: #ededed;
  --chip-active: #111111;
  --radius: 14px;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: var(--bg); }

.header { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 18px 8px; }
.header .title { font-size: 17px; font-weight: 600; line-height: 1.1; }
.header .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
.header .total { font-size: 17px; font-weight: 600; }
.header .menu { background: none; border: none; font-size: 16px; color: var(--ink);
  cursor: pointer; padding: 0 4px; }

.tabs { display: flex; gap: 18px; padding: 6px 18px 12px; overflow-x: auto;
  border-bottom: 1px solid var(--line); }
.tabs button { background: none; border: none; padding: 0 0 6px; font-size: 13px;
  color: var(--muted); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--ink); border-bottom-color: var(--chip-active); font-weight: 500; }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 14px; padding: 16px 18px 80px; }
.card { display: flex; flex-direction: column; cursor: pointer; }
.card .thumb { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #f4f4f4;
  border-radius: 10px; }
.card .brand { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted); margin-top: 8px; }
.card .name { font-size: 12px; line-height: 1.25; margin-top: 2px; }
.card .price { font-size: 12px; color: var(--muted); margin-top: 2px; }
.card .remove { align-self: flex-start; margin-top: 4px; background: none; border: none;
  color: var(--muted); font-size: 11px; cursor: pointer; padding: 0; display: none; }
.card:hover .remove { display: block; }

.empty { padding: 40px 18px; text-align: center; color: var(--muted); font-size: 13px; }

.save-btn { position: fixed; left: 18px; right: 18px; bottom: 16px; height: 44px;
  border: none; border-radius: 22px; background: var(--ink); color: #fff; font-size: 14px;
  font-weight: 500; cursor: pointer; }
.save-btn:disabled { opacity: 0.5; }
.toast { position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%);
  background: #111; color: #fff; font-size: 12px; padding: 8px 14px; border-radius: 16px;
  opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.toast.show { opacity: 1; }
```

**Step 2: Implement `popup.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="styles.css">
  <style> body { width: 340px; min-height: 420px; } </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Saved</div>
      <div class="subtitle" id="count">0 items</div>
    </div>
    <div style="display:flex; align-items:center; gap:10px;">
      <div class="total" id="total">$0</div>
      <button class="menu" id="open-gallery" title="Open full view">☰</button>
    </div>
  </div>
  <div class="tabs" id="tabs"></div>
  <div class="grid" id="grid"></div>
  <button class="save-btn" id="save">Save this page</button>
  <div class="toast" id="toast"></div>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

**Step 3: Implement `popup.js`**

```js
// popup.js
import { scrapeProduct } from './src/lib/scrape.js'
import { classify } from './src/lib/classify.js'
import { getItems, saveItem, removeItem } from './src/storage.js'
import { CATEGORIES } from './src/lib/classify.js'
import { formatPrice, totalValue, countByCategory, filterByCategory } from './src/lib/items.js'

const TAB_ORDER = ['all', ...CATEGORIES]
const LABELS = { all: 'All', tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear',
  shoes: 'Shoes', bags: 'Bags', accessories: 'Accessories' }
let active = 'all'

const $ = (id) => document.getElementById(id)

function render(items) {
  $('count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`
  $('total').textContent = formatPrice(totalValue(items), 'USD')
  const counts = countByCategory(items)

  const tabs = $('tabs'); tabs.innerHTML = ''
  for (const key of TAB_ORDER) {
    if (key !== 'all' && counts[key] === 0) continue // hide empty categories
    const b = document.createElement('button')
    b.textContent = LABELS[key]
    if (key === active) b.classList.add('active')
    b.onclick = () => { active = key; render(items) }
    tabs.appendChild(b)
  }

  const grid = $('grid'); grid.innerHTML = ''
  const shown = filterByCategory(items, active)
  if (!shown.length) {
    grid.innerHTML = '<div class="empty">Nothing here yet. Hit “Save this page” on a product.</div>'
    return
  }
  for (const it of shown) {
    const card = document.createElement('div'); card.className = 'card'
    card.innerHTML = `
      <img class="thumb" src="${it.image || ''}" alt="">
      <div class="brand">${it.brand || ''}</div>
      <div class="name">${it.title || ''}</div>
      <div class="price">${formatPrice(it.price, it.currency)}</div>
      <button class="remove">Remove</button>`
    card.querySelector('.thumb').onerror = (e) => { e.target.style.visibility = 'hidden' }
    card.querySelector('.remove').onclick = async (e) => {
      e.stopPropagation()
      render(await removeItem(it.id))
    }
    card.onclick = () => { if (it.url) chrome.tabs.create({ url: it.url }) }
    grid.appendChild(card)
  }
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 1600)
}

async function saveCurrentPage() {
  const btn = $('save'); btn.disabled = true; btn.textContent = 'Saving…'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ html: document.documentElement.outerHTML, url: location.href }),
    })
    const parsed = new DOMParser().parseFromString(result.html, 'text/html')
    const data = scrapeProduct(parsed)
    data.url = result.url // DOMParser docs have no location
    data.category = classify(`${data.title} ${data.brand || ''}`)
    const { added, items } = await saveItem(data)
    render(items)
    toast(added ? 'Saved ✓' : 'Already saved')
  } catch (err) {
    toast('Could not read this page')
    console.error(err)
  } finally {
    btn.disabled = false; btn.textContent = 'Save this page'
  }
}

$('save').onclick = saveCurrentPage
$('open-gallery').onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') })

getItems().then(render)
```

**Step 4: Manual verification in Chrome** (see Task 9 for load steps; do this once popup exists)

- Load unpacked, open a product page (e.g. a Shopify store or rimowa.com), click the icon, click "Save this page".
- Expected: a card appears with image/brand/title/price; total + count update; toast shows "Saved ✓".

**Step 5: Commit**

```bash
git add extension/popup.html extension/popup.js extension/styles.css
git commit -m "add popup: save button + compact saved grid"
```

---

## Task 7: Gallery — the pixel-matched "website" full-page view

Bundled page opened in its own tab. Same data, same design language, roomier grid that matches the screenshot layout exactly (header + `$total`, category tab bar, multi-column card grid, floating "+").

**Files:**
- Create: `extension/gallery.html`
- Create: `extension/gallery.js`
- Modify: `extension/styles.css` (add `.page` wrapper + responsive grid columns)

**Step 1: Append gallery styles to `styles.css`**

```css
/* gallery-specific */
.page { max-width: 980px; margin: 0 auto; padding: 0 8px; }
.page .header { padding: 28px 18px 12px; }
.page .header .title { font-size: 22px; }
.page .header .total { font-size: 22px; }
.page .tabs { padding: 8px 18px 16px; gap: 22px; }
.page .tabs button { font-size: 14px; }
.page .grid { grid-template-columns: repeat(3, 1fr); gap: 28px 22px; padding: 20px 18px 120px; }
@media (max-width: 720px) { .page .grid { grid-template-columns: repeat(2, 1fr); } }
.fab { position: fixed; right: 28px; bottom: 28px; width: 52px; height: 52px; border-radius: 50%;
  border: none; background: var(--ink); color: #fff; font-size: 26px; line-height: 1; cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
```

**Step 2: Implement `gallery.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WishlistCart</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="title">Saved</div>
        <div class="subtitle" id="count">0 items</div>
      </div>
      <div style="display:flex; align-items:center; gap:14px;">
        <div class="total" id="total">$0</div>
        <button class="menu" id="menu" title="Menu">☰</button>
      </div>
    </div>
    <div class="tabs" id="tabs"></div>
    <div class="grid" id="grid"></div>
  </div>
  <button class="fab" id="fab" title="Add the current tab">+</button>
  <div class="toast" id="toast"></div>
  <script type="module" src="gallery.js"></script>
</body>
</html>
```

**Step 3: Implement `gallery.js`** (reuses the same render approach; the `+` saves the active tab just like the popup, so the gallery is self-sufficient)

```js
// gallery.js
import { scrapeProduct } from './src/lib/scrape.js'
import { classify, CATEGORIES } from './src/lib/classify.js'
import { getItems, saveItem, removeItem } from './src/storage.js'
import { formatPrice, totalValue, countByCategory, filterByCategory } from './src/lib/items.js'

const TAB_ORDER = ['all', ...CATEGORIES]
const LABELS = { all: 'All', tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear',
  shoes: 'Shoes', bags: 'Bags', accessories: 'Accessories' }
let active = 'all'
const $ = (id) => document.getElementById(id)

function render(items) {
  $('count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`
  $('total').textContent = formatPrice(totalValue(items), 'USD')
  const counts = countByCategory(items)
  const tabs = $('tabs'); tabs.innerHTML = ''
  for (const key of TAB_ORDER) {
    if (key !== 'all' && counts[key] === 0) continue
    const b = document.createElement('button')
    b.textContent = LABELS[key]
    if (key === active) b.classList.add('active')
    b.onclick = () => { active = key; render(items) }
    tabs.appendChild(b)
  }
  const grid = $('grid'); grid.innerHTML = ''
  const shown = filterByCategory(items, active)
  if (!shown.length) {
    grid.innerHTML = '<div class="empty">Nothing saved yet.</div>'
    return
  }
  for (const it of shown) {
    const card = document.createElement('div'); card.className = 'card'
    card.innerHTML = `
      <img class="thumb" src="${it.image || ''}" alt="">
      <div class="brand">${it.brand || ''}</div>
      <div class="name">${it.title || ''}</div>
      <div class="price">${formatPrice(it.price, it.currency)}</div>
      <button class="remove">Remove</button>`
    card.querySelector('.thumb').onerror = (e) => { e.target.style.visibility = 'hidden' }
    card.querySelector('.remove').onclick = async (e) => {
      e.stopPropagation(); render(await removeItem(it.id))
    }
    card.onclick = () => { if (it.url) chrome.tabs.create({ url: it.url }) }
    grid.appendChild(card)
  }
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 1600)
}
async function addCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ html: document.documentElement.outerHTML, url: location.href }),
    })
    const parsed = new DOMParser().parseFromString(result.html, 'text/html')
    const data = scrapeProduct(parsed)
    data.url = result.url
    data.category = classify(`${data.title} ${data.brand || ''}`)
    const { added, items } = await saveItem(data)
    render(items)
    toast(added ? 'Saved ✓' : 'Already saved')
  } catch { toast('Open a product tab, then hit +') }
}
$('fab').onclick = addCurrentTab
getItems().then(render)
// Live-refresh if the popup saves something while this tab is open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wishlist_items) render(changes.wishlist_items.newValue || [])
})
```

**Step 4: Add `gallery.html` to web-accessible resources in `manifest.json`**

Modify `extension/manifest.json` — add:

```json
"web_accessible_resources": [
  { "resources": ["gallery.html"], "matches": ["<all_urls>"] }
]
```

**Step 5: Manual verification in Chrome**

- From the popup click the ☰ to open the gallery tab.
- Expected: 3-column grid, header with total, category tabs filter correctly, layout reads like the screenshot.

**Step 6: Commit**

```bash
git add extension/gallery.html extension/gallery.js extension/styles.css extension/manifest.json
git commit -m "add pixel-matched gallery full-page view"
```

---

## Task 8: Icons + seed data for verifying layout fidelity

To compare against the screenshot before real saves exist, add a dev seed and simple icons.

**Files:**
- Create: `extension/icons/icon48.png`, `extension/icons/icon128.png`
- Create: `extension/dev-seed.js` (loaded only when you paste it in the console — not referenced by manifest)

**Step 1: Generate placeholder icons**

Run:
```bash
cd /Users/sophiedavis/projects/personal/one_wishlistcart/extension
mkdir -p icons
# 1x1 black PNGs scaled by the browser are fine as placeholders:
printf '\x89PNG\r\n\x1a\n' > /dev/null # (executor: use a real generator below)
node -e "const fs=require('fs');const z=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');fs.writeFileSync('icons/icon48.png',z);fs.writeFileSync('icons/icon128.png',z);"
```
Expected: two tiny PNGs exist (placeholder; we can design real ones later).

**Step 2: Create `dev-seed.js`** — a snippet you paste into the gallery's devtools console to inject the exact screenshot items so we can eyeball pixel-match without scraping live sites:

```js
// dev-seed.js — paste into the gallery tab's console to load sample items.
chrome.storage.local.set({ wishlist_items: [
  { id:'1', brand:'FACE ROCK', title:'floral graphic T-shirt', price:285, currency:'USD',
    category:'tops', image:'https://picsum.photos/seed/tee/600' },
  { id:'2', brand:'RIMOWA', title:'Original Check-In M', price:1120.54, currency:'USD',
    category:'bags', image:'https://picsum.photos/seed/case/600' },
  { id:'3', brand:'FACE ROCK', title:'back graphic T-shirt', price:120, currency:'USD',
    category:'tops', image:'https://picsum.photos/seed/whitetee/600' },
  { id:'4', brand:'47 BRAND', title:'wool baseball cap', price:40, currency:'USD',
    category:'accessories', image:'https://picsum.photos/seed/cap/600' },
]}, () => location.reload())
```

**Step 3: Verify layout against screenshot**

- Open gallery, paste seed, compare to `~/Desktop/Screenshot 2026-06-17 at 3.34.22 PM.png`.
- Tune `styles.css` spacing/sizes until it reads the same. (Iterate here — this is the pixel-match task.)

**Step 4: Commit**

```bash
git add extension/icons extension/dev-seed.js
git commit -m "add placeholder icons + dev seed for layout match"
```

---

## Task 9: Chrome load + full manual smoke test

**No new files — verification gate.**

**Step 1: Load unpacked**

- Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → select `/Users/sophiedavis/projects/personal/one_wishlistcart/extension`.

**Step 2: Smoke test the full loop**

1. Go to a real product page (Shopify store, rimowa.com, ssense.com, etc.).
2. Click the WishlistCart icon → "Save this page".
3. Confirm card has correct image/brand/title/price and a sensible category.
4. Save 3–4 different items (a top, a bag, shoes).
5. Open gallery (☰), confirm tabs filter correctly and total is right.
6. Remove an item, confirm it disappears from both views.

**Step 3: Record results** in `docs/plans/2026-06-17-wishlistcart.md` under a "Verification" note (which sites scraped cleanly, which needed fallback).

No commit (verification only) unless tuning was needed.

---

## Task 10: Convert to Safari (requires full Xcode installed)

**Prereq:** Sophie installs full Xcode from the App Store, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

**Files:**
- Create: `safari/` (generated Xcode project — committed so it's reproducible)

**Step 1: Verify Xcode is active**

Run: `xcode-select -p`
Expected: `/Applications/Xcode.app/Contents/Developer` (NOT `/Library/Developer/CommandLineTools`).

**Step 2: Run the converter**

```bash
cd /Users/sophiedavis/projects/personal/one_wishlistcart
xcrun safari-web-extension-converter extension \
  --project-location safari \
  --app-name WishlistCart \
  --bundle-identifier ai.2389.sophie.wishlistcart \
  --no-open --force
```
Expected: generates `safari/WishlistCart/` Xcode project. Note any warnings about unsupported MV3 keys.

**Step 3: Build the app**

```bash
xcodebuild -project safari/WishlistCart/WishlistCart.xcodeproj \
  -scheme WishlistCart -configuration Debug build
```
Expected: BUILD SUCCEEDED.

**Step 4: Enable in Safari** (manual, Sophie)

- Run the built app once.
- Safari → Settings → Advanced → "Show features for web developers".
- Safari → Develop → "Allow Unsigned Extensions".
- Safari → Settings → Extensions → enable WishlistCart, grant permissions.

**Step 5: Smoke test in Safari**

- Repeat Task 9's loop in Safari. Note any API gaps (`chrome.*` is aliased to `browser.*` by the converter shim; verify `chrome.scripting` works).

**Step 6: Commit**

```bash
git add safari
git commit -m "add Safari web-extension Xcode project"
```

---

## Verification (filled during execution)

- [x] Unit tests green: `npm test` → **19 passed** (scrape JSON-LD/@graph/OG/DOM + price parsing, classifier, totals/format/filter).
- [x] Gallery layout matches screenshot — verified via headless screenshot of the real `gallery.js`/`view.js`/`styles.css` (`dev/gallery.png`): "Saved" + count, top-right total, hamburger, category tab bar (empty categories hidden), brand/name/price card grid, floating "+".
- [ ] Chrome: save loop on real sites — **must be done manually.** Chrome 149 (this machine) dropped the `--load-extension` flag (~M137), so Playwright can't auto-load the extension; `dev/integration.mjs` confirms workers=0. Load unpacked per README and save on a few sites.
- [ ] Safari: extension loads + saves — gated on full Xcode (Task 10).

**Not auto-verified:** the `chrome.*` plumbing (manifest registration, `storage.local`, `scripting.executeScript` on the active tab). These are standard MV3 and get exercised the moment the extension is loaded unpacked.

## Known risks / notes

- **MV3 in Safari:** the converter handles most of it; `service_worker` + `scripting` are supported on recent Safari (macOS 26 is well past the cutoff). If `chrome.scripting.executeScript` misbehaves in Safari, fallback is a declared content script that scrapes on demand via message passing.
- **Sites that block scraping / lazy-load images:** `og:image` usually still present; worst case image is blank (card hides broken img) and title/price come from JSON-LD. Acceptable for v1.
- **Auth-walled prices** (login-to-see-price): will save null price → shows "—". Fine for v1.
