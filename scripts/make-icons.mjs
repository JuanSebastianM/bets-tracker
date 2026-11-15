// Generates the PWA icons from an SVG drawn here (run locally; outputs are committed).
//   node scripts/make-icons.mjs
// The mark: a scoreboard slab on floodlight teal, with a rising price line (the app's accent).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require('/opt/npm-tools/node_modules/sharp');
}
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'assets/icons');
mkdirSync(out, { recursive: true });

/** @param {number} size @param {boolean} maskable full-bleed background with the mark in the 80% safe zone */
function svg(size, maskable = false) {
  const s = 512;
  const inset = maskable ? 0 : 0;
  const k = maskable ? 0.72 : 1; // mark scale
  const off = (s - s * k) / 2;
  const radius = maskable ? 0 : 112;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect x="${inset}" y="${inset}" width="${s}" height="${s}" rx="${radius}" fill="#0d6870"/>
  <g transform="translate(${off} ${off}) scale(${k})">
    <rect x="96" y="120" width="320" height="272" rx="28" fill="#0a4f55"/>
    <rect x="96" y="120" width="320" height="272" rx="28" fill="none" stroke="#e7f3f2" stroke-width="14"/>
    <path d="M140 318 L206 262 L258 290 L322 208 L372 236" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="372" cy="236" r="22" fill="#7ee0b0"/>
    <path d="M140 352 H372" stroke="#e7f3f2" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
  </g>
</svg>`);
}

const jobs = [
  ['apple-touch-icon.png', 180, true],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['favicon-32.png', 32, false],
  ['favicon-16.png', 16, false],
];
for (const [name, size, maskable] of jobs) {
  await sharp(svg(size, maskable)).png({ compressionLevel: 9 }).toFile(join(out, name));
  console.log('wrote', name);
}
