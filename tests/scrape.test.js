import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { scrapeProduct, parsePrice } from '../extension/src/lib/scrape.js'

function doc(html, url = 'https://shop.example.com/p/123') {
  const dom = new JSDOM(html, { url })
  return dom.window.document
}

describe('parsePrice', () => {
  it('US format with thousands + decimals', () => {
    expect(parsePrice('$1,120.54')).toBe(1120.54)
  })
  it('European format (dot thousands, comma decimal)', () => {
    expect(parsePrice('1.120,54 €')).toBe(1120.54)
  })
  it('plain integer', () => {
    expect(parsePrice('540')).toBe(540)
    expect(parsePrice(285)).toBe(285)
  })
  it('returns null for junk', () => {
    expect(parsePrice('Sold out')).toBe(null)
    expect(parsePrice(null)).toBe(null)
  })
})

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

  it('handles ProductGroup with hasVariant offers (Nike-style)', () => {
    const d = doc(`<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"ProductGroup","name":"Air Force 1 '07",
       "brand":{"@type":"Brand","name":"Nike"},"image":"https://img/af1.jpg",
       "hasVariant":[{"@type":"Product","offers":{"@type":"Offer","price":"115.00","priceCurrency":"USD"}}]}
      </script></head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe("Air Force 1 '07")
    expect(r.brand).toBe('Nike')
    expect(r.price).toBe(115)
  })

  it('handles AggregateOffer with lowPrice', () => {
    const d = doc(`<html><head>
      <script type="application/ld+json">
      {"@type":"Product","name":"Hoodie","image":"https://img/h.jpg",
       "offers":{"@type":"AggregateOffer","lowPrice":"60.00","highPrice":"80.00","priceCurrency":"USD"}}
      </script></head><body></body></html>`)
    expect(scrapeProduct(d).price).toBe(60)
  })

  it('reads ImageObject contentUrl', () => {
    const d = doc(`<html><head>
      <script type="application/ld+json">
      {"@type":"Product","name":"Tee","image":{"@type":"ImageObject","contentUrl":"https://img/c.jpg"},
       "offers":{"price":"20","priceCurrency":"USD"}}
      </script></head><body></body></html>`)
    expect(scrapeProduct(d).image).toBe('https://img/c.jpg')
  })

  it('falls back to Open Graph tags but NOT og:site_name for brand', () => {
    const d = doc(`<html><head>
      <meta property="og:title" content="Wool overcoat">
      <meta property="og:image" content="https://img/coat.jpg">
      <meta property="product:price:amount" content="540">
      <meta property="product:price:currency" content="USD">
      <meta property="og:site_name" content="Nike.com">
      </head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Wool overcoat')
    expect(r.image).toBe('https://img/coat.jpg')
    expect(r.price).toBe(540)
    expect(r.brand).toBe(null) // og:site_name must NOT become the brand
  })

  it('extracts a DOM price when no structured/OG price exists', () => {
    const d = doc(`<html><head><title>Trail Pants — REI</title></head>
      <body><h1>Trail Pants</h1>
        <span class="price-value">$49.73</span>
        <span class="price-compare">compared to $69.00</span>
      </body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Trail Pants')
    expect(r.price).toBe(49.73)
  })

  it('falls back to <title> and skips logo/svg images', () => {
    const d = doc(`<html><head><title>Plain Tee — Shop</title></head>
      <body>
        <img src="https://img/logo-seo.jpg" width="800" height="800">
        <img src="https://img/badge.svg" width="900" height="900">
        <img src="https://img/tee.jpg" width="600" height="600">
      </body></html>`)
    const r = scrapeProduct(d)
    expect(r.title).toBe('Plain Tee')
    expect(r.image).toBe('https://img/tee.jpg') // logo + svg skipped despite larger dims
  })

  it('prefers the live-page image hint over DOM guessing', () => {
    const d = doc(`<html><head><title>Sneaker</title></head>
      <body><img src="https://img/thumbnail.jpg" width="50" height="50"></body></html>`)
    const r = scrapeProduct(d, { image: 'https://img/hero-936.jpg' })
    expect(r.image).toBe('https://img/thumbnail.jpg') // DOM layer still wins when present
    const r2 = scrapeProduct(doc('<html><head><title>x</title></head><body></body></html>'),
      { image: 'https://img/hero-936.jpg' })
    expect(r2.image).toBe('https://img/hero-936.jpg') // hint used when nothing else
  })

  it('always returns the page url', () => {
    const d = doc(`<html><head><title>x</title></head><body></body></html>`,
                  'https://shop.example.com/p/999')
    expect(scrapeProduct(d).url).toBe('https://shop.example.com/p/999')
  })

  it('captures color and size from JSON-LD when present', () => {
    const d = doc(`<html><head><script type="application/ld+json">
      {"@type":"Product","name":"Trail runner","color":"Moss",
       "size":"W9","offers":{"price":"120","priceCurrency":"USD"}}
      </script></head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.color).toBe('Moss')
    expect(r.size).toBe('W9')
  })

  it('leaves color/size null when absent', () => {
    const d = doc(`<html><head><title>Plain Tee</title></head><body></body></html>`)
    const r = scrapeProduct(d)
    expect(r.color).toBe(null)
    expect(r.size).toBe(null)
  })
})
