# Family Page Implementation Plan (Phase 6)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One unguessable link Sophie can text the family: a read-only, mobile-friendly wishlist page that republishes automatically whenever the shared wishlist file changes.

**Architecture:** `wishlist-publish` (new bin in the existing `core/` crate) reads `wishlist.json`, writes a static site (assets embedded in the binary via `include_str!`) into a work dir, and force-pushes a single fresh commit to a random-named public GitHub Pages repo. The page is `family/index.html` + a copy of the extension's `styles.css`; a small inline-module JS fetches `items.json` and renders read-only cards (brand/title/price/qty·color·size meta, tabs, qty-aware total, links out). A launchd agent (`WatchPaths` on the wishlist file) triggers the publisher; config (repo slug) lives at `~/.config/wishlistcart/publish.json`.

**Tech Stack:** Rust (existing crate) + `std::process::Command` git; vanilla JS/CSS for the page; `gh` for repo creation + Pages enablement; launchd; Playwright eyeball via a local server.

**Decisions:**
- Page fetches `items.json` client-side (relative fetch, same origin) — publisher stays dumb: serialize visible items + copy assets + git push.
- Force-push one fresh commit each publish (content is derived; no history value; both Macs could publish without conflict).
- `<meta name="robots" content="noindex">` on the page; repo name `wl-<12 random hex>`.
- Publisher exits 0 quietly when config or wishlist file is missing (launchd-safe).
- Git identity passed explicitly with `-c user.name/user.email`; auth rides the existing gh credential helper.

### Task 1: family page assets (TDD-by-smoke)
`family/index.html` (header/tabs/grid markup matching the gallery, inline module JS rendering from `fetch('items.json')`, read-only) — reuses class names so `styles.css` applies. Verify with a temp dir: copy assets + a hand-written `items.json`, serve locally, extend a one-off Playwright check (cards, tabs, total, meta line, noindex). Commit.

### Task 2: `wishlist-publish` render step (TDD)
`src/bin/wishlist-publish.rs` + `publishing` module in lib: `render_site(store, out_dir)` writes `index.html`, `styles.css` (both `include_str!`'d from `../../family/` and `../../extension/`), and `items.json` (visible items only — tombstones stay private). Rust test: tempdir render → files exist, items.json parses, deleted items excluded. Commit.

### Task 3: publish step (TDD against a local bare repo)
`publish(work_dir, remote_url)`: init-if-needed, write site, single commit, force-push `main`. Config loading from `~/.config/wishlistcart/publish.json` (`{"remote": "...", "workDir": "..."}`). Rust test: publish twice into a tempdir bare remote, assert remote main has the files and exactly 1 commit. Commit.

### Task 4: create the real Pages repo + first publish
`gh repo create wl-<random> --public`, enable Pages (branch main, root) via `gh api`, write publish.json, `cargo build --release`, run `wishlist-publish`, poll the Pages URL until live, verify with WebFetch/curl + Playwright screenshot at phone width. Commit installer additions.

### Task 5: publish trigger — REVISED during execution
The planned launchd `WatchPaths` agent is a dead end: reading
`~/Library/Mobile Documents` from a launchd agent blocks forever inside
`open()` — TCC can't render a permission prompt for a faceless background
process (verified with `sample`: publisher hung 5+ min in `__open`).

Revised design: **the host triggers the publisher.** After any successful
mutating op, `wishlist-host` fire-and-forgets `wishlist-publish` (skipped when
`~/.config/wishlistcart/publish.json` is absent, and in protocol tests via
`WISHLIST_PUBLISH_CONFIG=/nonexistent`). The host inherits a TCC-blessed
context (Chrome or a terminal), each Mac publishes its own edits, and no
agent is needed at all. Verified end-to-end both directions (save → item live
in ~40s; remove → gone in ~50s).

Two macOS lessons encoded here: the TCC/launchd hang above, and `cp` over an
installed binary in place = SIGKILL on next exec (stale code-signature cache);
installers must `rm` first.

### Task 6: docs + hand over the link
README family-page section; design-doc progress note. Give Sophie the URL.
