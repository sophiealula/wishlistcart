import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeItemPatch, normalizeUrl, updateItem } from '../extension/src/storage.js'

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

describe('normalizeItemPatch', () => {
  it('trims editable strings and parses formatted prices', () => {
    expect(normalizeItemPatch({
      title: '  Trail Pants  ',
      brand: '  REI  ',
      price: '$49.73',
      currency: ' usd ',
      category: 'bottoms',
      image: '  https://img/pants.jpg  ',
      url: '  https://shop.example/pants  ',
    })).toEqual({
      title: 'Trail Pants',
      brand: 'REI',
      price: 49.73,
      currency: 'USD',
      category: 'bottoms',
      image: 'https://img/pants.jpg',
      url: 'https://shop.example/pants',
    })
  })

  it('normalizes qty (positive int, default 1) and trims color/size', () => {
    expect(normalizeItemPatch({ qty: '3', color: '  Navy ', size: ' M ' }))
      .toEqual({ qty: 3, color: 'Navy', size: 'M' })
    expect(normalizeItemPatch({ qty: '', color: '', size: '' }))
      .toEqual({ qty: 1, color: null, size: null })
    expect(normalizeItemPatch({ qty: '0' })).toEqual({ qty: 1 })
    expect(normalizeItemPatch({ qty: 'abc' })).toEqual({ qty: 1 })
  })

  it('nulls blank optional fields and ignores invalid categories', () => {
    expect(normalizeItemPatch({
      title: ' ',
      brand: '',
      price: '',
      currency: '',
      category: 'homeware',
      image: '',
    })).toEqual({
      title: 'Untitled item',
      brand: null,
      price: null,
      currency: 'USD',
      image: null,
    })
  })
})

describe('updateItem', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.chrome
  })

  it('updates one saved item and preserves the rest', async () => {
    let store = {
      wishlist_items: [
        { id: 'a', title: 'Old tee', price: 10, currency: 'USD', category: 'tops' },
        { id: 'b', title: 'Tote', price: 20, currency: 'USD', category: 'bags' },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => store),
          set: vi.fn(async (next) => { store = { ...store, ...next } }),
        },
      },
    }
    vi.spyOn(Date, 'now').mockReturnValue(123456)

    const next = await updateItem('a', { title: 'New tee', price: '$12.50', category: 'tops' })

    expect(next).toEqual([
      { id: 'a', title: 'New tee', price: 12.5, currency: 'USD', category: 'tops', updatedAt: 123456 },
      { id: 'b', title: 'Tote', price: 20, currency: 'USD', category: 'bags' },
    ])
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith({ wishlist_items: next })
  })

  it('does not write when the item id is missing', async () => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({ wishlist_items: [{ id: 'a', title: 'Tee' }] })),
          set: vi.fn(),
        },
      },
    }

    await expect(updateItem('missing', { title: 'Nope' })).resolves.toEqual([{ id: 'a', title: 'Tee' }])
    expect(globalThis.chrome.storage.local.set).not.toHaveBeenCalled()
  })
})
