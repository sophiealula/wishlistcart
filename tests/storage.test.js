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

describe('native host adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete globalThis.chrome
  })

  // Fresh module per test so the cached host-availability probe resets.
  const freshStorage = () => import('../extension/src/storage.js?' + Math.random())

  function mockChrome({ hostResponses, local = {} }) {
    let store = { ...local }
    globalThis.chrome = {
      runtime: {
        sendNativeMessage: vi.fn(async (_host, msg) => {
          const handler = hostResponses[msg.op]
          if (!handler) throw new Error('unexpected op ' + msg.op)
          return typeof handler === 'function' ? handler(msg) : handler
        }),
      },
      storage: {
        local: {
          get: vi.fn(async (keys) => {
            const out = {}
            for (const k of Array.isArray(keys) ? keys : [keys]) {
              if (k in store) out[k] = store[k]
            }
            return out
          }),
          set: vi.fn(async (obj) => { Object.assign(store, obj) }),
          remove: vi.fn(async (k) => { delete store[k] }),
        },
      },
    }
    return { store: () => store }
  }

  it('routes through the host when ping succeeds, with normalized patches', async () => {
    const calls = []
    mockChrome({ hostResponses: {
      ping: { ok: true, pong: true },
      getItems: { ok: true, items: [{ id: 'h1', title: 'From host' }] },
      updateItem: (msg) => { calls.push(msg); return { ok: true, items: [] } },
    } })
    const { getItems, updateItem } = await freshStorage()
    expect(await getItems()).toEqual([{ id: 'h1', title: 'From host' }])
    await updateItem('h1', { title: '  Spaced  ', qty: '4' })
    expect(calls[0].patch).toEqual({ title: 'Spaced', qty: 4 })
  })

  it('falls back to local storage when the host is unavailable', async () => {
    mockChrome({
      hostResponses: { ping: () => { throw new Error('no host') } },
      local: { wishlist_items: [{ id: 'l1', title: 'Local' }] },
    })
    const { getItems } = await freshStorage()
    expect(await getItems()).toEqual([{ id: 'l1', title: 'Local' }])
  })

  it('migrates browser-local items to the host once, then clears them', async () => {
    const imports = []
    const mock = mockChrome({
      hostResponses: {
        ping: { ok: true, pong: true },
        import: (msg) => { imports.push(msg.items); return { ok: true, items: msg.items } },
        getItems: { ok: true, items: [] },
      },
      local: { wishlist_items: [{ id: 'l1', title: 'Migrate me' }] },
    })
    const { getItems } = await freshStorage()
    await getItems()
    await getItems()
    expect(imports).toEqual([[{ id: 'l1', title: 'Migrate me' }]])
    expect(mock.store().wishlist_items).toBeUndefined()
    expect(mock.store().wishlist_migrated_to_host).toBe(true)
  })
})
