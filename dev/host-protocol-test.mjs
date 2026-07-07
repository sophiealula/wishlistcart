// Integration test: drive the built wishlist-host binary over the real
// length-prefixed native-messaging protocol against a temp wishlist file.
//   cargo build --release --manifest-path core/Cargo.toml && node dev/host-protocol-test.mjs
// Optionally: HOST_BIN=~/.local/bin/wishlist-host node dev/host-protocol-test.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const bin = process.env.HOST_BIN || 'core/target/release/wishlist-host'
const dir = mkdtempSync(join(tmpdir(), 'wlc-'))
const file = join(dir, 'wishlist.json')

function call(msg) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [], { env: { ...process.env, WISHLIST_FILE: file } })
    const body = Buffer.from(JSON.stringify(msg))
    const len = Buffer.alloc(4)
    len.writeUInt32LE(body.length)
    const chunks = []
    proc.stdout.on('data', (c) => chunks.push(c))
    proc.on('error', reject)
    proc.on('close', () => {
      const buf = Buffer.concat(chunks)
      if (buf.length < 4) return reject(new Error('no response'))
      resolve(JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString()))
    })
    proc.stdin.write(Buffer.concat([len, body]))
    proc.stdin.end()
  })
}

const ping = await call({ op: 'ping' })
assert.equal(ping.ok, true)
assert.equal(ping.pong, true)

const empty = await call({ op: 'getItems' })
assert.deepEqual(empty.items, [])

const saved = await call({ op: 'saveItem', item: {
  id: '', title: 'Trail Pants', brand: 'REI', price: 49.73, currency: 'USD',
  category: 'bottoms', url: 'https://shop.example/pants?utm_source=x', qty: 1,
} })
assert.equal(saved.added, true)
assert.equal(saved.items.length, 1)
const id = saved.items[0].id
assert.ok(id.length > 10)
assert.ok(saved.items[0].addedAt > 0)

const dupe = await call({ op: 'saveItem', item: { id: '', title: 'Dupe', url: 'https://shop.example/pants#reviews' } })
assert.equal(dupe.added, false)

const updated = await call({ op: 'updateItem', id, patch: { title: 'New pants', qty: 3, color: 'Olive' } })
assert.equal(updated.items[0].title, 'New pants')
assert.equal(updated.items[0].qty, 3)
assert.equal(updated.items[0].color, 'Olive')

const imported = await call({ op: 'import', items: [
  { id: 'browser-1', title: 'Old browser item', addedAt: 100, updatedAt: 100, qty: 1 },
] })
assert.equal(imported.items.length, 2)

const removed = await call({ op: 'removeItem', id })
assert.equal(removed.items.length, 1)
assert.equal(removed.items[0].id, 'browser-1')

const onDisk = JSON.parse(readFileSync(file, 'utf8'))
assert.equal(onDisk.items.length, 2) // tombstone retained on disk
assert.ok(onDisk.items.some((i) => i.deleted))

const bad = await call({ op: 'nonsense' })
assert.equal(bad.ok, false)

console.log('host-protocol-test: all assertions passed')
