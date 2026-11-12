import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decode(file) {
  const buf = readFileSync(file);
  let pos = 8, width = 0, height = 0, bpp = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error(`${file}: unsupported PNG format`);
      bpp = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp, px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = (v + p) & 255;
    }
  }
  return { width, height, bpp, px };
}

const [fa, fb] = process.argv.slice(2);
const A = decode(fa), B = decode(fb);
if (A.width !== B.width || A.height !== B.height || A.bpp !== B.bpp) {
  process.stdout.write(`${fa} vs ${fb}: sizes differ ${A.width}x${A.height} vs ${B.width}x${B.height}\n`);
  process.exit(1);
}
let n = 0, maxDelta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
for (let i = 0; i < A.width * A.height; i += 1) {
  let d = 0;
  for (let k = 0; k < A.bpp; k += 1) d = Math.max(d, Math.abs(A.px[i * A.bpp + k] - B.px[i * A.bpp + k]));
  if (d === 0) continue;
  n += 1; maxDelta = Math.max(maxDelta, d);
  const x = i % A.width, y = Math.floor(i / A.width);
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
process.stdout.write(`${fa} vs ${fb}: ${A.width}x${A.height}, differing pixels ${n}${n ? `, max channel delta ${maxDelta}, bounding box x ${x0}..${x1}, y ${y0}..${y1}` : ''}\n`);
