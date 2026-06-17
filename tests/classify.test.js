import { describe, it, expect } from 'vitest'
import { classify, CATEGORIES } from '../extension/src/lib/classify.js'

describe('classify', () => {
  it('detects tops', () => {
    expect(classify('Floral graphic T-shirt')).toBe('tops')
    expect(classify('Ribbed knit sweater')).toBe('tops')
  })
  it('detects bottoms', () => {
    expect(classify('Slim fit denim jeans')).toBe('bottoms')
    expect(classify('Pleated midi skirt')).toBe('bottoms')
  })
  it('detects outerwear', () => {
    expect(classify('Wool overcoat')).toBe('outerwear')
    expect(classify('Quilted puffer jacket')).toBe('outerwear')
  })
  it('detects shoes', () => {
    expect(classify('Leather chelsea boots')).toBe('shoes')
    expect(classify('Running sneakers')).toBe('shoes')
  })
  it('detects bags', () => {
    expect(classify('Original Check-In M aluminum suitcase')).toBe('bags')
    expect(classify('Leather tote bag')).toBe('bags')
  })
  it('detects accessories', () => {
    expect(classify('Floral graphic baseball cap')).toBe('accessories')
  })
  it('falls back to accessories when unknown', () => {
    expect(classify('Mystery object 3000')).toBe('accessories')
  })
  it('prefers shoes over outerwear when both hint present', () => {
    expect(classify('Rain boots')).toBe('shoes')
  })
  it('does not misread "short sleeve" tops as bottoms', () => {
    expect(classify('Short sleeve t-shirt')).toBe('tops')
    expect(classify('Cargo shorts')).toBe('bottoms')
  })
  it('does not match substrings (laptop != tops, topcoat = outerwear)', () => {
    expect(classify('Laptop sleeve')).toBe('accessories')
    expect(classify('Wool topcoat')).toBe('outerwear')
  })
  it('classifies henley as tops', () => {
    expect(classify("Men's Henley")).toBe('tops')
  })
  it('exports the canonical category list in display order', () => {
    expect(CATEGORIES).toEqual(['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories'])
  })
})
