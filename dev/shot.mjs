import { chromium } from 'playwright'

const base = process.env.BASE || 'http://localhost:8123'
const browser = await chromium.launch({ channel: 'chrome' })

// Gallery (desktop "website" view)
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${base}/dev/preview-gallery.html`, { waitUntil: 'networkidle' })
await page.waitForSelector('.card')
await page.screenshot({ path: 'dev/gallery.png' })

const readState = async () => ({
  total: await page.textContent('#total'),
  count: await page.textContent('#count'),
  cards: await page.$$eval('.card .name', (n) => n.map((x) => x.textContent)),
  tabs: await page.$$eval('.tabs button', (n) => n.map((x) => x.textContent)),
  metas: await page.$$eval('.card .meta', (n) => n.map((x) => x.textContent)),
})

const before = await readState()

await page.locator('.card').first().hover()
await page.locator('.card .edit').first().click()
await page.fill('.editor-panel input[name="title"]', 'edited floral T-shirt')
await page.fill('.editor-panel input[name="price"]', '$300')
await page.fill('.editor-panel input[name="qty"]', '1')
await page.fill('.editor-panel input[name="color"]', 'Blue')
await page.selectOption('.editor-panel select[name="category"]', 'outerwear')
await page.click('.editor-actions .primary')
await page.waitForSelector('.editor-shell', { state: 'hidden' })

const after = await readState()

// Responsive check: same page at iPhone width, no errors, same cards.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
phone.on('console', (m) => { if (m.type() === 'error') errors.push(`phone: ${m.text()}`) })
phone.on('pageerror', (e) => errors.push(`phone: ${e}`))
await phone.goto(`${base}/dev/preview-gallery.html`, { waitUntil: 'networkidle' })
await phone.waitForSelector('.card')
await phone.screenshot({ path: 'dev/gallery-iphone.png', fullPage: true })
const phoneCards = await phone.$$eval('.card', (n) => n.length)
const phoneScrollsX = await phone.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth)

if (errors.length) throw new Error(`Preview console errors: ${errors.join('; ')}`)
// Seed: item 1 is qty 2 × $285, so it counts twice in the initial total.
if (before.total !== '$1,850.54' || before.count !== '4 items' ||
    before.metas[0] !== 'Qty 2 · Red · L') {
  throw new Error(`Unexpected initial state: ${JSON.stringify(before)}`)
}
if (after.total !== '$1,580.54' || after.cards[0] !== 'edited floral T-shirt' ||
    after.metas[0] !== 'Blue · L' || !after.tabs.includes('Outerwear')) {
  throw new Error(`Edit smoke test failed: ${JSON.stringify(after)}`)
}
if (phoneCards !== 4) throw new Error(`Phone view shows ${phoneCards} cards, expected 4`)
if (phoneScrollsX) throw new Error('Phone view scrolls horizontally')

console.log(JSON.stringify({ before, after, phoneCards, errors }, null, 2))
await browser.close()
