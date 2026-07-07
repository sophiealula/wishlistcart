export function parsePrice(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw).trim().replace(/[^0-9.,]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  // Decide which separator is the decimal point by whichever comes last,
  // but only treat it as decimal when it's followed by 1-2 digits.
  if (lastComma > lastDot) {
    // European style "1.120,54" -> dot = thousands, comma = decimal
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/[.,]/g, '')
  } else {
    // US style "1,120.54" -> comma = thousands
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const JUNK_IMAGE = /logo|sprite|icon|badge|placeholder|b-corp|favicon|\.svg(\?|$)/i

function firstString(v) {
  if (Array.isArray(v)) return firstString(v[0])
  if (v && typeof v === 'object') return v.url || v.contentUrl || v.name || v['@id'] || null
  return v ?? null
}

function isProductType(node) {
  const t = node && node['@type']
  if (!t) return false
  const types = Array.isArray(t) ? t : [t]
  return types.includes('Product') || types.includes('ProductGroup')
}

function collectProducts(node, out) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((n) => collectProducts(n, out)); return }
  if (isProductType(node)) out.push(node)
  if (node['@graph']) collectProducts(node['@graph'], out)
  if (Array.isArray(node.hasVariant)) collectProducts(node.hasVariant, out)
}

// Extract a price from any Offer / AggregateOffer / array-of-offers / priceSpecification.
function priceFromOffers(offers) {
  if (!offers) return null
  const o = Array.isArray(offers) ? offers[0] : offers
  if (!o) return null
  const candidates = [
    o.price, o.lowPrice,
    o.priceSpecification && o.priceSpecification.price,
  ]
  for (const c of candidates) {
    const p = parsePrice(c)
    if (p != null) return p
  }
  if (o.offers) return priceFromOffers(o.offers) // AggregateOffer nesting
  return null
}

function currencyFromOffers(offers) {
  const o = Array.isArray(offers) ? offers[0] : offers
  if (!o) return null
  return o.priceCurrency ||
    (o.priceSpecification && o.priceSpecification.priceCurrency) ||
    (o.offers && currencyFromOffers(o.offers)) || null
}

function fromJsonLd(d) {
  const products = []
  for (const s of d.querySelectorAll('script[type="application/ld+json"]')) {
    let data
    try { data = JSON.parse(s.textContent) } catch { continue }
    collectProducts(data, products)
  }
  // Prefer a product that actually carries offers/price.
  const offers = (p) => p.offers || (p.hasVariant && p.hasVariant[0] && p.hasVariant[0].offers)
  const p = products.find((x) => priceFromOffers(offers(x)) != null) || products[0]
  if (!p) return null
  const off = offers(p)
  return {
    title: firstString(p.name),
    brand: firstString(p.brand),
    image: firstString(p.image),
    price: priceFromOffers(off),
    currency: currencyFromOffers(off),
    color: firstString(p.color),
    size: firstString(p.size),
  }
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
  // NOTE: deliberately NOT using og:site_name for brand — it's the store name
  // ("Nike.com", "SSENSE"), not the product brand, and produces wrong data.
  const brand = meta(d, 'meta[property="product:brand"]')
  if (!title && !image) return null
  return { title, image, price: parsePrice(price), currency, brand }
}

function cleanTitle(t) {
  if (!t) return null
  return t.split(/\s+[—|–·]\s+/)[0].trim()
}

// Scan likely price elements in the (live-captured) DOM.
function domPrice(d) {
  const sels = [
    'meta[itemprop="price"]',
    '[itemprop="price"]',
    '[data-test*="price" i]',
    '[class*="price" i]',
  ]
  for (const sel of sels) {
    for (const el of d.querySelectorAll(sel)) {
      const raw = el.getAttribute && el.getAttribute('content')
        ? el.getAttribute('content')
        : (el.textContent || '')
      // Skip crossed-out / "compare at" context by taking the first $-number.
      const m = raw.match(/[$£€]\s?\d[\d.,]*/)
      const p = parsePrice(m ? m[0] : raw)
      if (p != null && p > 0) return p
    }
  }
  return null
}

function absolutize(src) {
  if (src && src.startsWith('//')) return 'https:' + src
  return src
}

function domImage(d) {
  let best = null, bestArea = 0
  for (const img of d.querySelectorAll('img')) {
    const src = absolutize(img.getAttribute('src') || img.getAttribute('data-src') || '')
    if (!src || src.startsWith('data:') || JUNK_IMAGE.test(src)) continue
    const w = parseInt(img.getAttribute('width') || '0', 10) || 0
    const h = parseInt(img.getAttribute('height') || '0', 10) || 0
    const area = w * h
    if (area > bestArea) { bestArea = area; best = src }
    else if (!best) best = src // first usable image as a floor
  }
  return best
}

function fromDom(d) {
  const title = cleanTitle(d.title) ||
    (d.querySelector('h1') && d.querySelector('h1').textContent.trim())
  return { title, image: domImage(d), price: domPrice(d), currency: null, brand: null }
}

function pickImage(candidates) {
  const usable = candidates.filter(Boolean)
  return usable.find((u) => !JUNK_IMAGE.test(u)) || usable[0] || null
}

// hints (optional): { image } computed in the live page where naturalWidth/currentSrc exist.
export function scrapeProduct(d, hints = {}) {
  const layers = [fromJsonLd(d), fromOpenGraph(d), fromDom(d)].filter(Boolean)
  const pick = (key) => {
    for (const l of layers) if (l[key] != null && l[key] !== '') return l[key]
    return null
  }
  const rawTitle = pick('title')
  // Image priority: structured/og/dom (in layer order), then the live-page hint.
  const imageCandidates = [...layers.map((l) => l.image), hints.image]
  return {
    title: cleanTitle(rawTitle) || rawTitle || 'Untitled item',
    brand: pick('brand'),
    price: pick('price'),
    currency: pick('currency') || 'USD',
    image: pickImage(imageCandidates),
    color: pick('color'),
    size: pick('size'),
    url: (d.location && d.location.href) || d.URL || null,
  }
}
