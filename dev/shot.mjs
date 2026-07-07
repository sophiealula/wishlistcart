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
})

const before = await readState()

await page.locator('.card').first().hover()
await page.locator('.card .edit').first().click()
await page.fill('.editor-panel input[name="title"]', 'edited floral T-shirt')
await page.fill('.editor-panel input[name="price"]', '$300')
await page.selectOption('.editor-panel select[name="category"]', 'outerwear')
await page.click('.editor-actions .primary')
await page.waitForSelector('.editor-shell', { state: 'hidden' })

const after = await readState()

if (errors.length) throw new Error(`Preview console errors: ${errors.join('; ')}`)
if (before.total !== '$1,565.54' || before.count !== '4 items') {
  throw new Error(`Unexpected initial state: ${JSON.stringify(before)}`)
}
if (after.total !== '$1,580.54' || after.cards[0] !== 'edited floral T-shirt' ||
    !after.tabs.includes('Outerwear')) {
  throw new Error(`Edit smoke test failed: ${JSON.stringify(after)}`)
}

console.log(JSON.stringify({ before, after, errors }, null, 2))
await browser.close()
