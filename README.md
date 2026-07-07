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

## Install it (Chrome, Arc, Edge, Brave — any Chromium browser)

1. Download `wishlistcart.zip` from the
   [latest release](https://github.com/sophiealula/wishlistcart/releases/latest)
   and unzip it. Keep the unzipped `wishlistcart` folder somewhere permanent
   (Documents, not Downloads) — the browser loads it from there, so if you
   delete the folder the extension breaks.
2. Go to `chrome://extensions` and turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select the unzipped `wishlistcart` folder.
4. Pin the icon (puzzle piece → pin), open any product page, click it →
   **Save this page**.
5. Click the ☰ in the popup to open the full gallery view.

Chrome will show a "developer mode extensions" notice on startup — that's
normal for extensions installed outside the Web Store, just dismiss it.
Your saved items live entirely in your own browser; nothing is uploaded.

To update later: download the new zip, replace the folder's contents, and hit
the ↻ reload button on the extension card in `chrome://extensions`.

> Dev note: Chrome 137+ removed the `--load-extension` command-line flag, so the
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

## Synced mode (Sophie's Macs)

By default the extension keeps items in browser-local storage. When the
`wishlist-host` native-messaging host is installed, the extension detects it
and reads/writes a shared file instead:
`~/Library/Mobile Documents/com~apple~CloudDocs/WishlistCart/wishlist.json` —
iCloud Drive syncs it between Macs, so Chrome/Arc/Safari all see one list.
Existing browser-local items migrate into the file automatically on first
contact. Friends without the host are untouched — the extension silently
falls back to local storage.

```bash
./dev/install-host.sh   # builds the Rust host, installs binary + Chrome manifest
```

The host is a Rust binary (`core/`) speaking Chrome's native-messaging
protocol; the same crate will grow UniFFI bindings for the Mac app.
`node dev/host-protocol-test.mjs` integration-tests the built binary.

## Family page

`wishlist-publish` renders the wishlist (visible items only) into a static,
phone-friendly, read-only page and force-pushes it to a random-named GitHub
Pages repo — an unguessable link to share with family. The host triggers a
republish after every save/edit/remove, so the page tracks the list with
~1 minute of lag. Config: `~/.config/wishlistcart/publish.json`
(`{"remote": ..., "workDir": ...}`); no config → publishing is skipped.

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

To cut a new release zip:

```bash
ditto extension wishlistcart
zip -r wishlistcart.zip wishlistcart -x '*.DS_Store'
rm -rf wishlistcart
gh release create v0.x.y wishlistcart.zip --title v0.x.y
```

## License

MIT
