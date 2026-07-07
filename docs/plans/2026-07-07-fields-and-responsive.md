# Item Fields (qty/color/size) + Responsive Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add quantity/color/size to items end-to-end (scrape best-effort, edit, display, totals) and make the gallery read well at phone widths — phases 1–2 of `2026-07-07-sync-apps-family-design.md`.

**Architecture:** Pure JS changes to the existing extension. New optional item fields flow scrape → save → storage patch-normalization → edit modal → card meta line → qty-aware totals. Responsive CSS on the shared stylesheet; the gallery rendering later becomes the family page.

**Tech Stack:** Vanilla JS extension (no build step), Vitest + jsdom, Playwright smoke test via `dev/shot.mjs`.

Phases 3–7 (Rust core/sync, Safari, Mac app, family publish, goblin rollout) are specified in the design doc and get their own implementation plans when reached.

---

### Task 1: qty-aware totals in items.js

**Files:**
- Modify: `extension/src/lib/items.js`
- Test: `tests/items.test.js`

**Step 1: Write the failing tests** — append to `tests/items.test.js`:

```js
describe('quantity-aware totals', () => {
  it('multiplies price by qty, treating missing qty as 1', () => {
    expect(totalValue([
      { price: 10, qty: 3 },
      { price: 5 },
      { price: 2, qty: null },
    ])).toBe(37)
  })
  it('summarize counts qty into the dominant-currency total', () => {
    const { total } = summarize([
      { price: 10, qty: 2, currency: 'USD' },
      { price: 1, currency: 'USD' },
    ])
    expect(total).toBe(21)
  })
})
```

Also add `summarize` to the existing import line in that file.

**Step 2:** Run `npx vitest run tests/items.test.js` — expect the two new tests to FAIL (totals of 17 and 11).

**Step 3:** In `extension/src/lib/items.js`, make `totalValue` qty-aware:

```js
export function totalValue(items) {
  const sum = items.reduce((acc, it) =>
    acc + (Number.isFinite(it.price) ? it.price * (Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1) : 0), 0)
  return Math.round(sum * 100) / 100
}
```

(`summarize` already delegates to `totalValue`, so it picks this up.)

**Step 4:** Run `npx vitest run tests/items.test.js` — all PASS.

**Step 5:** Commit: `git commit -m "totals respect item qty"`

---

### Task 2: storage accepts qty/color/size patches

**Files:**
- Modify: `extension/src/storage.js`
- Test: `tests/storage.test.js`

**Step 1: Write the failing tests** — append inside the `normalizeItemPatch` describe:

```js
it('normalizes qty (positive int, default 1) and trims color/size', () => {
  expect(normalizeItemPatch({ qty: '3', color: '  Navy ', size: ' M ' }))
    .toEqual({ qty: 3, color: 'Navy', size: 'M' })
  expect(normalizeItemPatch({ qty: '', color: '', size: '' }))
    .toEqual({ qty: 1, color: null, size: null })
  expect(normalizeItemPatch({ qty: '0' })).toEqual({ qty: 1 })
  expect(normalizeItemPatch({ qty: 'abc' })).toEqual({ qty: 1 })
})
```

**Step 2:** Run `npx vitest run tests/storage.test.js` — new test FAILS (qty/color/size dropped from the patch).

**Step 3:** In `extension/src/storage.js`: add `'qty', 'color', 'size'` to `EDITABLE_FIELDS`, and in `normalizeItemPatch` add before the final `else`:

```js
} else if (key === 'qty') {
  const n = parseInt(value, 10)
  out.qty = Number.isFinite(n) && n > 0 ? n : 1
```

(`color`/`size` fall through to the existing `cleanText` else-branch.)

**Step 4:** Run `npx vitest run tests/storage.test.js` — PASS.

**Step 5:** Commit: `git commit -m "storage: qty/color/size editable fields"`

---

### Task 3: best-effort color/size scrape from JSON-LD

**Files:**
- Modify: `extension/src/lib/scrape.js`
- Test: `tests/scrape.test.js`

**Step 1: Write the failing test** — append to `tests/scrape.test.js`:

```js
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
```

**Step 2:** Run `npx vitest run tests/scrape.test.js` — FAIL (`color`/`size` undefined).

**Step 3:** In `extension/src/lib/scrape.js`: in the JSON-LD product extraction, add `color: firstString(p.color)` and `size: firstString(p.size)` to the returned object (note: JSON-LD `size` may be an object with `name` — `firstString` already handles that). In `scrapeProduct`'s final return, add `color: pick('color')` and `size: pick('size')`. The OG/DOM layers don't set them, so `pick` yields null.

**Step 4:** Run `npx vitest run tests/scrape.test.js` — PASS. Run full `npx vitest run` — all PASS.

**Step 5:** Commit: `git commit -m "scrape color/size from json-ld"`

---

### Task 4: default qty on save

**Files:**
- Modify: `extension/src/view.js` (`saveActiveTab`)

**Step 1:** In `saveActiveTab`, after `data.category = classify(...)`, add:

```js
data.qty = 1
```

(Older saved items without `qty` are handled by the qty-default logic in totals and display — no migration needed.)

**Step 2:** Run `npx vitest run` — still green (no unit coverage of `saveActiveTab`; verified by the smoke test in Task 7).

**Step 3:** Commit: `git commit -m "default qty 1 on save"`

---

### Task 5: edit modal gains Qty / Color / Size

**Files:**
- Modify: `extension/src/view.js` (`ensureEditor`, `openEditor`)

**Step 1:** In the editor template in `ensureEditor`, after the Currency/Category row insert:

```html
<div class="editor-row three">
  <label>Qty<input name="qty" type="number" min="1" step="1"></label>
  <label>Color<input name="color"></label>
  <label>Size<input name="size"></label>
</div>
```

**Step 2:** In `openEditor`, populate: `f.qty.value = Number.isFinite(item.qty) && item.qty > 0 ? String(item.qty) : '1'`, `f.color.value = item.color || ''`, `f.size.value = item.size || ''`. In the submit patch add `qty: f.qty.value, color: f.color.value, size: f.size.value` (storage normalizes).

**Step 3:** Add CSS in `extension/styles.css` next to `.editor-row`:

```css
.editor-row.three { grid-template-columns: 72px minmax(0,1fr) minmax(0,1fr); }
@media (max-width: 460px) { .editor-row.three { grid-template-columns: 1fr; } }
```

**Step 4:** Commit: `git commit -m "edit modal: qty/color/size"` (verified end-to-end in Task 7).

---

### Task 6: card meta line (qty · color · size)

**Files:**
- Modify: `extension/src/view.js` (`renderCollection`), `extension/styles.css`

**Step 1:** In the card template add `<div class="meta"></div>` after `.price`, then populate:

```js
const meta = [
  Number.isFinite(it.qty) && it.qty > 1 ? `Qty ${it.qty}` : null,
  it.color, it.size,
].filter(Boolean).join(' · ')
card.querySelector('.meta').textContent = meta
```

**Step 2:** CSS: `.card .meta { font-size: 11px; color: var(--muted); margin-top: 2px; }`

**Step 3:** Commit: `git commit -m "cards show qty/color/size meta"`

---

### Task 7: extend the preview smoke test

**Files:**
- Modify: `dev/preview-gallery.html` (seed), `dev/shot.mjs`

**Step 1:** In the seed, give item 1 `qty:2, color:'Red', size:'L'`. Note the expected initial total changes: item 1 counts twice → `$1,850.54`.

**Step 2:** In `dev/shot.mjs`: update the `before.total` assertion to `$1,850.54`; extend `readState` with `metas: await page.$$eval('.card .meta', n => n.map(x => x.textContent))`; assert `before.metas[0] === 'Qty 2 · Red · L'`. In the edit flow, also fill `qty` → `1`, `color` → `Blue`, and assert `after.metas[0] === 'Blue · L'` and the new expected total (item 1 now 300×1: `$1,580.54`).

**Step 3:** Run `python3 -m http.server 8123 &` then `node dev/shot.mjs` — PASS with the new assertions.

**Step 4:** Commit: `git commit -m "smoke test covers qty/color/size edit flow"`

---

### Task 8: responsive gallery CSS

**Files:**
- Modify: `extension/styles.css`
- Verify: `dev/shot.mjs`

**Step 1:** Add a phone breakpoint for the gallery page (the popup is fixed-width and unaffected):

```css
@media (max-width: 600px) {
  .page .grid { grid-template-columns: repeat(2, 1fr); gap: 20px 12px; }
  .page .header { padding: 20px 14px 8px; }
  .page .header .title, .page .header .total { font-size: 18px; }
  .page .tabs { padding: 6px 14px 12px; gap: 16px; }
}
```

Check existing `@media (max-width: 720px)` rule for the grid doesn't conflict (it already sets 2 columns — extend rather than duplicate if so).

**Step 2:** In `dev/shot.mjs`, after the existing flow, open a second page at iPhone viewport (`{ width: 390, height: 844 }`, `deviceScaleFactor: 3`), screenshot to `dev/gallery-iphone.png`, assert no console errors and `.card` count matches desktop.

**Step 3:** Run the smoke test; view `dev/gallery-iphone.png` to confirm the layout reads well (2-col grid, no horizontal scroll, header intact).

**Step 4:** Commit: `git commit -m "responsive gallery at phone widths + iphone screenshot check"`

---

### Task 9: ship v0.2.0

**Step 1:** Bump `"version": "0.2.0"` in `extension/manifest.json` and `package.json`.

**Step 2:** Full verification: `npx vitest run` (all pass), smoke test (pass), then build the zip per README recipe.

**Step 3:** `gh release create v0.2.0 wishlistcart.zip --title "WishlistCart v0.2.0" --notes "..."` (notes: qty/color/size fields + phone-friendly gallery).

**Step 4:** Update goblin: re-download zip into `~/Documents/wishlistcart` over SSH (contents replaced in place), remind Sophie to hit ↻ on the extension card.

**Step 5:** Commit + push: `git commit -m "v0.2.0" && git push`
