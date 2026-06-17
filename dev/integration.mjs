// Loads the real extension in Chrome and verifies: manifest loads, the gallery
// page renders within the real extension context (real chrome.storage), and the
// scrape pipeline extracts the right fields from a JSON-LD product page.
import { chromium } from 'playwright'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const ext = path.resolve('extension')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlc-'))

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: false,
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
  ],
})

const errors = []
ctx.on('weberror', (e) => errors.push(String(e.error())))

// Find the extension id via its service worker.
let sw = ctx.serviceWorkers()[0]
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)
let extId = sw ? new URL(sw.url()).host : null

// Fallback: read it off chrome://extensions.
if (!extId) {
  const ext0 = await ctx.newPage()
  await ext0.goto('chrome://extensions')
  extId = await ext0.evaluate(() => {
    const mgr = document.querySelector('extensions-manager')
    const items = mgr?.shadowRoot?.querySelector('extensions-item-list')
      ?.shadowRoot?.querySelectorAll('extensions-item')
    return items && items.length ? items[0].getAttribute('id') : null
  })
  await ext0.close()
}
console.error('DEBUG extId=', extId, 'workers=', ctx.serviceWorkers().length)

// 1) Open the gallery page in the REAL extension context and seed via real storage.
const gallery = await ctx.newPage()
gallery.on('pageerror', (e) => errors.push('gallery: ' + String(e)))
await gallery.goto(`chrome-extension://${extId}/gallery.html`)
await gallery.evaluate(() => new Promise((res) => {
  chrome.storage.local.set({ wishlist_items: [
    { id: 'a', brand: 'TEST', title: 'Knit sweater', price: 90, currency: 'USD', category: 'tops', url: 'x' },
    { id: 'b', brand: 'TEST', title: 'Tote bag', price: 200, currency: 'USD', category: 'bags', url: 'y' },
  ] }, res)
}))
await gallery.reload()
await gallery.waitForSelector('.card')
const galleryTotal = await gallery.textContent('#total')
const galleryCards = await gallery.$$eval('.card .name', (n) => n.map((x) => x.textContent))

// 2) Verify the scrape pipeline against a real product page rendered in Chrome.
const product = await ctx.newPage()
await product.setContent(`<!doctype html><html><head>
  <title>Should be ignored — Store</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"Cropped denim jacket",
   "brand":{"@type":"Brand","name":"ACME"},"image":"https://img.example/jacket.jpg",
   "offers":{"@type":"Offer","price":"248.00","priceCurrency":"USD"}}
  </script></head><body><h1>Cropped denim jacket</h1></body></html>`)

// Run the exact scrape+classify the extension runs, from the gallery's module context.
const scraped = await gallery.evaluate(async (html) => {
  const { scrapeProduct } = await import('./src/lib/scrape.js')
  const { classify } = await import('./src/lib/classify.js')
  const d = new DOMParser().parseFromString(html, 'text/html')
  const data = scrapeProduct(d)
  data.category = classify(`${data.title} ${data.brand || ''}`)
  return data
}, await product.content())

console.log(JSON.stringify({
  extId, galleryTotal, galleryCards, scraped, errors,
}, null, 2))

await ctx.close()
fs.rmSync(userDataDir, { recursive: true, force: true })
