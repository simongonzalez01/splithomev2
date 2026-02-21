/**
 * generate-icons.mjs
 * Generates public/icons/icon-192.png and icon-512.png
 * using only Node.js built-ins (no sharp, no canvas).
 * Run: node scripts/generate-icons.mjs
 */

import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { deflateSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')

await mkdir(outDir, { recursive: true })

// ── PNG encoder (minimal, no deps) ──────────────────────────────────────────

function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}

function crc32(buf) {
  let crc = 0xffffffff
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      t[i] = c
    }
    return t
  })())
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (~crc) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))])
}

function makePNG(size, r, g, b) {
  // IHDR
  const ihdr = Buffer.concat([
    u32be(size), u32be(size),
    Buffer.from([8, 2, 0, 0, 0]),  // 8-bit RGB
  ])

  // Raw scanlines: each row = filter(0) + R G B per pixel
  const row = Buffer.alloc(1 + size * 3)
  row[0] = 0  // filter None
  for (let x = 0; x < size; x++) {
    row[1 + x * 3]     = r
    row[1 + x * 3 + 1] = g
    row[1 + x * 3 + 2] = b
  }
  const raw = Buffer.concat(Array(size).fill(row))
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Blue: #2563EB (37, 99, 235)
const SIZES = [192, 512]

for (const size of SIZES) {
  const png = makePNG(size, 37, 99, 235)
  const path = join(outDir, `icon-${size}.png`)
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(path)
    ws.end(png)
    ws.on('finish', resolve)
    ws.on('error', reject)
  })
  console.log(`✅  ${path}  (${png.length} bytes)`)
}

console.log('Done! Icons generated in public/icons/')
