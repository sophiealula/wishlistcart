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
