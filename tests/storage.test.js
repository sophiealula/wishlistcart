import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../extension/src/storage.js'

describe('normalizeUrl', () => {
  it('strips hash and tracking params, keeps meaningful query', () => {
    expect(normalizeUrl('https://shop.com/p/1?utm_source=ig&color=black#reviews'))
      .toBe('https://shop.com/p/1?color=black')
  })
  it('treats tracking-only variants as the same url', () => {
    const a = normalizeUrl('https://shop.com/p/1?fbclid=xyz')
    const b = normalizeUrl('https://shop.com/p/1?gclid=abc')
    expect(a).toBe(b)
  })
  it('passes through bad input unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url')
    expect(normalizeUrl(undefined)).toBe(undefined)
  })
})
