# WishlistCart

Save products from across the web with one click, then sort them by category
(Tops / Bottoms / Outerwear / Shoes / Bags / Accessories) in a clean gallery.

One Manifest V3 web extension. No server, no cloud, no accounts — everything
lives in `chrome.storage.local` on your machine.

- **Popup** — the toolbar button. "Save this page" scrapes the current product
  page; shows a compact saved grid.
- **Gallery** (`gallery.html`, opens in its own tab) — the full-page "website"
  view that matches the reference layout: header + running total, category tabs,
  card grid, floating "+".

Capture is automatic: it reads JSON-LD `Product` schema → Open Graph tags → DOM
fallbacks to fill image / brand / title / price, and a keyword classifier picks
the category. Nothing to type.

When a scrape gets something wrong, hover a card and hit ✎ to edit any field
(title / brand / price / currency / category / image / URL) in place.

## Load it in Chrome (instant)

1. `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → select the `extension/` folder.
3. Pin the icon, open any product page, click it → **Save this page**.
4. Click the ☰ in the popup to open the full gallery.

> Note: Chrome 137+ removed the `--load-extension` command-line flag, so the
> extension can't be auto-loaded by Playwright — load it manually as above.

## Load it in Safari (needs full Xcode)

```bash
xcode-select -p   # must be /Applications/Xcode.app/..., not CommandLineTools
xcrun safari-web-extension-converter extension \
  --project-location safari --app-name WishlistCart \
  --bundle-identifier ai.2389.sophie.wishlistcart --no-open --force
xcodebuild -project safari/WishlistCart/WishlistCart.xcodeproj \
  -scheme WishlistCart -configuration Debug build
```

Then run the built app once, and in Safari: Settings → Advanced → "Show features
for web developers"; Develop → "Allow Unsigned Extensions"; Settings →
Extensions → enable WishlistCart.

## Develop

```bash
npm install
npm test          # unit tests for scrape / classify / totals logic
```

`dev/preview-gallery.html` renders the gallery with mock data + `chrome` stubs so
you can iterate on layout without loading the extension. It uses ES module
imports, so it needs a local server (not `file://`):

```bash
python3 -m http.server 8123   # from repo root
node dev/shot.mjs             # screenshots it to dev/gallery.png
```

`dev/integration.mjs` loads the real extension via `--load-extension`, which
Chrome 137+ removed — it only works on older Chrome.
