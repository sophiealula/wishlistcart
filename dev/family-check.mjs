import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(process.env.URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.card')
const state = {
  count: await page.textContent('#count'),
  total: await page.textContent('#total'),
  metas: await page.$$eval('.card .meta', (n) => n.map((x) => x.textContent)),
  tabs: await page.$$eval('.tabs button', (n) => n.map((x) => x.textContent)),
  firstHref: await page.$eval('a.card', (a) => a.href),
  robots: await page.$eval('meta[name="robots"]', (m) => m.content),
  scrollsX: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
}
await page.screenshot({ path: process.env.SHOT, fullPage: true })
await browser.close()
if (errors.length) throw new Error('console errors: ' + errors.join('; '))
if (state.count !== '2 items' || state.total !== '$1,690.54' ||
    state.metas[0] !== 'Qty 2 · Red · L' || !state.tabs.includes('Bags') ||
    !state.firstHref.startsWith('https://example.com/tee') ||
    !state.robots.includes('noindex') || state.scrollsX) {
  throw new Error('family page check failed: ' + JSON.stringify(state))
}
console.log('family page check passed:', JSON.stringify(state))
