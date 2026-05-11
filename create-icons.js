// node create-icons.js
// Generates icons/icon16.png, icon48.png, icon128.png — no dependencies.

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG writer ────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return ((c ^ 0xffffffff) >>> 0);
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

function makePNG(pixels, size) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(size, 0); b.writeUInt32BE(size, 4);
    b[8] = 8; b[9] = 6;
    return pngChunk('IHDR', b);
  })();
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++)
      raw.set(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4), y * stride + 1 + x * 4);
  }
  return Buffer.concat([sig, ihdr, pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Drawing primitives ────────────────────────────────────────

function createCanvas(size) {
  const px = new Uint8Array(size * size * 4);

  const blend = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i  = (y * size + x) * 4;
    const ao = px[i + 3] / 255, an = a / 255, af = an + ao * (1 - an);
    if (!af) return;
    px[i]     = (r * an + px[i]     * ao * (1 - an)) / af;
    px[i + 1] = (g * an + px[i + 1] * ao * (1 - an)) / af;
    px[i + 2] = (b * an + px[i + 2] * ao * (1 - an)) / af;
    px[i + 3] = af * 255;
  };

  const disc = (cx, cy, radius, r, g, b, a = 255) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const alpha = Math.max(0, Math.min(1, radius - Math.hypot(x - cx, y - cy) + 0.5));
        if (alpha > 0) blend(x, y, r, g, b, Math.round(alpha * a));
      }
  };

  const arc = (cx, cy, radius, a0, a1, thick, r, g, b, a = 255) => {
    const steps = Math.ceil(Math.abs(a1 - a0) * radius * 3);
    for (let s = 0; s <= steps; s++) {
      const angle = a0 + (a1 - a0) * s / steps;
      disc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, thick / 2, r, g, b, a);
    }
  };

  return { px, disc, arc };
}

// ── Icon design ───────────────────────────────────────────────
//
//  Dark disc  →  ring track  →  white almond eye  →
//  dark iris  →  orange + purple hypnotic spiral  →  shine dot

function renderIcon(size) {
  const cx = size / 2, cy = size / 2;
  const sc = size / 16;
  const { px, disc, arc } = createCanvas(size);

  // Background
  disc(cx, cy, size / 2 - 0.3, 15, 15, 23);

  // Outer ring track (same colour as the countdown ring track in the popup)
  arc(cx, cy, size / 2 - sc * 0.9, 0, Math.PI * 2, sc * 0.7, 46, 46, 74);

  // Eye geometry
  const eyeW   = size * 0.38;   // half-width of almond
  const eyeH   = size * 0.25;   // half-height of almond
  const irisR  = eyeH * 0.92;   // iris radius
  const stroke = sc * 1.05;

  // Almond outline (two mirrored arcs)
  const eyeSteps = 110;
  for (const flip of [-1, 1]) {
    for (let i = 0; i <= eyeSteps; i++) {
      const t  = i / eyeSteps;
      const ax = cx + (t * 2 - 1) * eyeW;
      const ay = cy + flip * eyeH * Math.sin(t * Math.PI);
      disc(ax, ay, stroke / 2, 215, 212, 232);
    }
  }

  // Iris base — dark so the spiral pops
  disc(cx, cy, irisR, 18, 8, 42);

  // ── Hypnotic Archimedean spiral ──────────────────────────────
  // Alternates between orange (#f97316) and purple (#7c3aed) every half-turn.
  // Starts at the centre and unwinds outward.
  const turns      = Math.max(1.5, size / 40);   // 1.5 turns @ 16px, ~3.2 @ 128px
  const totalAngle = turns * Math.PI * 2;
  const armGap     = irisR / turns;               // pixel gap between spiral arms
  const thickness  = Math.max(0.75, armGap * 0.45);
  const spiralPts  = Math.ceil(totalAngle * irisR * 5);

  for (let i = 0; i <= spiralPts; i++) {
    const t      = i / spiralPts;
    const angle  = totalAngle * t - Math.PI / 2;  // start unwinding from top
    const r      = irisR * 0.96 * t;
    const spx    = cx + Math.cos(angle) * r;
    const spy    = cy + Math.sin(angle) * r;

    // Switch colour every half-turn
    const halfTurn = Math.floor((totalAngle * t) / Math.PI);
    const [sr, sg, sb] = halfTurn % 2 === 0
      ? [249, 115,  22]   // orange
      : [139,  92, 246];  // purple
    disc(spx, spy, thickness / 2, sr, sg, sb);
  }

  // Bright centre dot (where the spiral starts)
  disc(cx, cy, Math.max(0.6, sc * 0.55), 255, 240, 200);

  // Tiny catchlight (upper-right of iris) for depth
  disc(cx + irisR * 0.38, cy - irisR * 0.42, Math.max(0.5, sc * 0.45), 255, 255, 255, 160);

  return makePNG(px, size);
}

// ── Generate ──────────────────────────────────────────────────

fs.mkdirSync(path.join(__dirname, 'icons'), { recursive: true });

for (const size of [16, 48, 128]) {
  const buf  = renderIcon(size);
  const dest = path.join(__dirname, 'icons', `icon${size}.png`);
  fs.writeFileSync(dest, buf);
  console.log(`✓  icons/icon${size}.png  (${buf.length} bytes)`);
}
console.log('Done.');
