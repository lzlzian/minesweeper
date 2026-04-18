// Placeholder PNG icon generator - zero-dep Node script.
// Produces solid-color RGB PNGs at required sizes for PWA + iOS.
// Color matches body background (#1a1a2e); a crude diagonal highlight
// distinguishes the icon from pure noise.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, bgR, bgG, bgB, fgR, fgG, fgB) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(2, 9);   // color type: RGB
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  // Raw pixel data, row by row, each row prefixed with filter byte 0.
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      // Diamond mask: inside the center diamond use fg color, else bg.
      const cx = size / 2;
      const cy = size / 2;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      const inDiamond = d < size * 0.28;
      const r = inDiamond ? fgR : bgR;
      const g = inDiamond ? fgG : bgG;
      const b = inDiamond ? fgB : bgB;
      const idx = y * rowSize + 1 + x * 3;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
    }
  }

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Background: #1a1a2e. Foreground: gold-ish (#d4a017) for contrast.
const bg = [0x1a, 0x1a, 0x2e];
const fg = [0xd4, 0xa0, 0x17];

const outputs = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

const assetsDir = path.join(__dirname, '..', 'assets');
for (const { size, name } of outputs) {
  const buf = makePng(size, bg[0], bg[1], bg[2], fg[0], fg[1], fg[2]);
  const outPath = path.join(assetsDir, name);
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
}
