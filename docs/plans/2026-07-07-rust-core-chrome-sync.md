# Rust Core + Chrome Sync Implementation Plan (Phase 3)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Rust crate owning the canonical wishlist file (iCloud-Drive-synced, LWW merge, tombstones) plus a Chrome native-messaging host, with the extension's storage layer routing through it when present and falling back to browser-local storage when not.

**Architecture:** `core/` Rust crate: item model + merge + atomic file I/O + ops (get/save/update/remove/import), and a `wishlist-host` bin speaking Chrome's length-prefixed stdio protocol. `extension/src/storage.js` becomes an adapter: ping the host once per session; use it if it answers, else the existing `chrome.storage.local` path (friends unaffected). UniFFI bindings are deferred to phases 4–5 (Safari/Mac app) — the crate is written so they bolt on.

**Tech Stack:** Rust 1.94 (already installed), serde/serde_json/uuid/tempfile; vitest for the JS adapter; a node integration script speaking the real protocol to the built binary.

**Key facts discovered during design:**
- Canonical file: `~/Library/Mobile Documents/com~apple~CloudDocs/WishlistCart/wishlist.json` (override with `WISHLIST_FILE` env var for tests).
- Unpacked-extension IDs are `sha256(path)[:32]` hex→a-p. Verified against goblin.
  - This laptop (repo `extension/` dir): `nnfacpdklceojhingfgmcfgdpkjjmplj`
  - Goblin (`~/Documents/wishlistcart`): `maihghimkloimpchnicmcacoajopcnek`
- Host manifest name: `ai.2389.sophie.wishlistcart` at
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/ai.2389.sophie.wishlistcart.json`,
  `allowed_origins` lists both extension IDs.
- Binary installs to `~/.local/bin/wishlist-host` (no sudo).
- Extension manifest gains `"nativeMessaging"` permission.

**Semantics (locked by design doc):**
- Items keep JS field names (`addedAt`/`updatedAt` ms epoch) — serde renames.
- `removeItem` = tombstone (`deleted: true`, stamp `updatedAt`), never hard-delete; tombstones purged when older than 90 days on write.
- Merge: union by id, LWW per item by `updatedAt` (falling back to `addedAt`, then keep incumbent).
- `saveItem` dedupes by normalized URL (same tracking-param rules as JS) against non-deleted items; returns `added: false` on dupe. Host stamps `id` (uuid v4), `addedAt`, `updatedAt`.
- `updateItem` applies a patch of editable fields as-sent (JS keeps doing the normalization it does today), stamps `updatedAt`.
- `getItems` returns non-deleted items, newest `addedAt` first.
- `import` (migration op): merge browser-local items in; items keep their ids/timestamps.
- Every op is read-file → apply → merge-safe atomic write (temp file + rename in same dir).

---

### Task 1: crate scaffold
`cargo new core --lib --name wishlistcart-core --vcs none`; add `[[bin]] wishlist-host` (`src/bin/wishlist-host.rs` stub), deps: serde(+derive), serde_json, uuid(v4), thiserror; dev-deps: tempfile. Add `core/target/` to `.gitignore`. `cargo test` green (0 tests). Commit.

### Task 2: item model + store types (TDD)
`src/model.rs`: `Item` struct, all optional fields `Option<...>`, `#[serde(rename_all = "camelCase", skip_serializing_if = "Option::is_none")]`-style so JSON round-trips exactly what JS wrote; unknown fields preserved is NOT required (schema is ours). `Store { version: u32, items: Vec<Item> }`. Tests: round-trip an item JSON produced by the JS shape (fixture string with qty/color/size), missing-fields tolerance. Commit.

### Task 3: normalize_url (TDD)
Port the JS rules: strip hash; drop query params matching `^(utm_|fbclid|gclid|mc_|ref|ref_|_branch|igshid)` case-insensitive; pass through unparseable urls. Tests ported from `tests/storage.test.js` cases. Commit.

### Task 4: merge + tombstone purge (TDD)
`merge(ours, theirs) -> Vec<Item>`: union by id, LWW by (`updatedAt` else `addedAt`); stable order not required (ops sort on read). `purge_tombstones(items, now_ms)`: drop `deleted` items whose `updatedAt` < now − 90d. Tests: newer-wins both directions, tie keeps ours, delete-vs-edit (newer edit resurrects only if newer than tombstone — plain LWW), purge boundary. Commit.

### Task 5: file I/O (TDD)
`load(path) -> Store` (missing file → empty store v1), `save(path, &Store)` atomic (tempfile in same dir + persist/rename), creates parent dirs. Tests with tempdir: fresh load, round-trip, corrupt file → error (host will surface, not clobber). Commit.

### Task 6: ops (TDD)
`ops.rs`: `get_items`, `save_item(item_json)`, `update_item(id, patch_json)`, `remove_item(id)`, `import(items)` — each takes the path, does load→apply(+merge semantics)→purge→save, returns the post-op non-deleted sorted items. Patch application: only known editable keys (`title brand price currency category image url qty color size`) copied onto the item. Tests: save stamps id/timestamps + url-dedupe, update patches + stamps updatedAt, remove tombstones (file retains it, get_items hides it), import merges LWW. Commit.

### Task 7: native-messaging host (TDD via node script)
`src/bin/wishlist-host.rs`: loop { read u32 LE length + JSON from stdin; dispatch `{op, ...}`; write length-prefixed `{ok:true, ...}` / `{ok:false, error}` }. `ping` op answers `{ok:true, pong:true}`. File path from `WISHLIST_FILE` env else default. Integration test `dev/host-protocol-test.mjs`: spawns the release binary with `WISHLIST_FILE` in a temp dir, drives ping → save → update → remove → getItems, asserts shapes; run via `node dev/host-protocol-test.mjs` after `cargo build --release`. Commit.

### Task 8: JS storage adapter (TDD)
`extension/src/storage.js`: add `HOST = 'ai.2389.sophie.wishlistcart'`; lazily ping via `chrome.runtime.sendNativeMessage` (promise API), cache availability; route getItems/saveItem/updateItem/removeItem through host ops when available (updateItem still applies `normalizeItemPatch` before sending). On first successful host contact with browser-local items present: send `import`, then clear the local key (single source of truth thereafter). Fallback paths unchanged. Add `"nativeMessaging"` to `extension/manifest.json` permissions. Vitest: mock `sendNativeMessage` to test routing, fallback-when-error, and one-time migration. Commit.

### Task 9: install + wire up this Mac
`dev/install-host.sh`: `cargo build --release`, copy bin to `~/.local/bin/wishlist-host`, write the Chrome host manifest with both allowed_origins, mkdir the iCloud WishlistCart dir. Run it. Run the protocol test against the *installed* binary. Sophie loads `extension/` unpacked on this laptop (expected ID `nnfacpdklceojhingfgmcfgdpkjjmplj` — verify against Chrome after load; if it differs, fix the manifest with the real ID). Verify end-to-end: save a product in Chrome → `wishlist.json` contains it. Commit.

### Task 10: docs + ship
README: sync section (what the host is, install script, friends-don't-need-it). Design-doc check-off. Push. (No extension release needed for friends — adapter falls back — but cut v0.2.1 zip so goblin/laptop match git.) Goblin host install waits for phase 7 / goblin being awake.
