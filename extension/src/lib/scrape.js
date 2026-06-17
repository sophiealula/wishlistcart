export function parsePrice(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const cleaned = String(raw).replace(/[^0-9.,]/g, '')
  if (!cleaned) return null
  // Strip thousands commas, keep dot as decimal.
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
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
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
  const brand = meta(d, 'meta[property="product:brand"]') ||
                meta(d, 'meta[property="og:site_name"]')
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
  const rawTitle = pick('title')
  return {
    title: cleanTitle(rawTitle) || rawTitle || 'Untitled item',
    brand: pick('brand'),
    price: pick('price'),
    currency: pick('currency') || 'USD',
    image: pick('image'),
    url: (d.location && d.location.href) || d.URL || null,
  }
}
