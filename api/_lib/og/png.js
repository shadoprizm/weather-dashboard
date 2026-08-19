'use strict';

/**
 * A minimal PNG encoder.
 *
 * Link previews need a raster image — Facebook, X, iMessage and WhatsApp will
 * not render an SVG — and the alternative was a headless browser or a WASM
 * font stack, either of which would be larger than the entire rest of this
 * project. PNG's baseline format is small enough to write: a header, one
 * zlib stream of filtered scanlines, an end marker. `zlib` is in Node's core.
 */

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/**
 * Encode 8-bit RGB pixels (3 bytes per pixel, row-major) as a PNG.
 *
 * Filter type 1 ("Sub") on every row: the card is mostly smooth gradients, so
 * predicting each pixel from its left neighbour compresses far better than
 * leaving the rows raw, and it costs one subtraction per byte.
 */
function encodePng(rgb, width, height) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1;
    const src = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 3 ? rgb[src + x - 3] : 0;
      raw[rowStart + 1 + x] = (rgb[src + x] - left) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { encodePng, crc32 };
