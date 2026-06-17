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

const total = await page.textContent('#total')
const count = await page.textContent('#count')
const cards = await page.$$eval('.card .name', (n) => n.map((x) => x.textContent))
const tabs = await page.$$eval('.tabs button', (n) => n.map((x) => x.textContent))

console.log(JSON.stringify({ total, count, cards, tabs, errors }, null, 2))
await browser.close()
