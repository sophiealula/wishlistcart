# WishlistCart: Sync, Apps, and Family Sharing — Design

Approved 2026-07-07 after brainstorming with Sophie.

## Goals

1. Safari support alongside Chrome (extension project already exists in `safari/`).
2. One wishlist across Safari + Chrome on every one of Sophie's Macs. No paid
   cloud, no server. Free Apple team only (no CloudKit/iCloud entitlements).
3. Native Mac app. Core logic in Rust with UniFFI bindings so an iPhone app
   can share the same core later (deferred: free team = 7-day app expiry).
4. Shareable family webpage at an unguessable URL, mobile-responsive — this is
   also the iPhone experience for now (add to home screen).
5. Items carry `qty`, `color`, `size` (clothing/shoes) — scraped best-effort,
   always hand-editable, shown everywhere including the family page.
6. Friends' standalone extension installs (browser-local storage, no sync)
   keep working unchanged.

## Architecture

### Canonical store

`~/Library/Mobile Documents/com~apple~CloudDocs/WishlistCart/wishlist.json`

- iCloud Drive syncs the file between Macs — plain folder writes, no
  entitlements needed on macOS.
- Shape: `{ "version": 1, "items": [Item, ...] }`.
- Item: `id, title, brand, price, currency, category, image, url, qty, color,
  size, addedAt, updatedAt, deleted`.
- `deleted: true` tombstones (purged after 90 days) so removals survive merge.
- Merge: last-write-wins per item by `updatedAt`. Every writer does
  read → merge → atomic write (temp file + rename).

### Rust core (`core/` crate)

Owns: item model, merge, file I/O, price parse/format, URL normalization,
JSON (de)serialization. UniFFI generates Swift bindings (xcframework) for the
Mac app and Safari handler.

Binary targets from the same crate:

- **`wishlist-host`** — Chrome native-messaging host (stdio JSON protocol:
  `getItems / saveItem / updateItem / removeItem`). Registered via manifest in
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`.
- **`wishlist-publish`** — renders `wishlist.json` + static assets into the
  family page and force-pushes to the Pages repo (content is derived, so
  force-push is safe; last publisher wins).

### Surfaces

| Surface | Path to data |
|---|---|
| Chrome extension | JS UI → native messaging → `wishlist-host` → file. Falls back to `chrome.storage.local` when host absent (friends' installs). |
| Safari extension | Same JS UI → `browser.runtime.sendNativeMessage` → Swift `SafariWebExtensionHandler` → UniFFI core → file. Sandbox relaxed (personal dev-signed build). Fallback if macOS fights the sandbox: route through the wrapper app. |
| Mac app | SwiftUI + UniFFI core, direct file access, FSEvents watcher for live updates. Grid/tabs/totals/edit parity with the web gallery. |
| Family + iPhone | Static page published to GitHub Pages under a random-named repo (`sophiealula.github.io/wl-<random>/`). Read-only, responsive, shows qty/color/size. launchd `WatchPaths` on the file triggers `wishlist-publish`. |

Extensions keep their existing JS scrape/classify/render logic (decision:
one rewrite, not two; drift risk between JS and Rust logic accepted and
covered by shared test fixtures where practical).

## Phases (each independently shippable)

1. **Fields, pure JS** — qty/color/size in edit modal + cards + best-effort
   variant scraping + tests. Ships to all current installs.
2. **Responsive gallery** — phone-width CSS pass on `gallery.html`; the same
   rendering becomes the family page.
3. **Rust core + Chrome sync** — crate, `wishlist-host`, storage adapter with
   fallback, one-time migration of existing browser data into the file.
4. **Safari** — handler → UniFFI core, build, enable on this Mac.
5. **Mac app** — SwiftUI gallery with live file updates.
6. **Family page** — `wishlist-publish` + launchd watcher + Pages repo; hand
   Sophie one link.
7. **Goblin rollout** — host manifest + app + watcher over SSH.

## Accepted risks / limitations

- Color/size scraping is hit-or-miss; hand-editing is the reliable path.
- Family page is public at an unguessable URL (unlisted-video privacy model).
- iCloud Drive conflict copies are possible if both Macs write offline;
  per-item LWW merge on next write converges, and the file is small.
- iPhone native app deferred until/unless Apple Developer Program membership;
  the UniFFI core is the hedge that makes it cheap later.
