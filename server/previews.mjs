// First-page previews and page counts for resource files (Resources page cards).
// PDF: page 1 rendered with pdf.js onto @napi-rs/canvas. DOCX: page count from docProps/app.xml and a
// layout render of page 1 (headings, paragraphs, lists and tables drawn as bars; it needs no fonts).
// Both libraries are optional at runtime: if either fails to load, uploads still work and the card
// shows a type illustration instead of a preview.
import path from 'node:path';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';

export const PREVIEW_W = 264; // 3x the 88 px desktop tile
export const PREVIEW_H = 348; // 3x 116

const require = createRequire(import.meta.url);
let libs; // { pdfjs, canvas } | null, loaded once
async function loadLibs() {
  if (libs !== undefined) return libs;
  try {
    const canvas = await import('@napi-rs/canvas');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    libs = { canvas, pdfjs };
  } catch (err) {
    console.warn(`Previews off: ${err.message}`);
    libs = null;
  }
  return libs;
}

let fontDir;
const standardFonts = () => (fontDir ??= `${path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/`);

/** { pages, png } for a stored file. Either can be null. Never throws. */
export async function analyseFile(ext, bytes) {
  try {
    if (ext === 'pdf') return await analysePdf(bytes);
    if (ext === 'docx') return await analyseDocx(bytes);
  } catch (err) {
    console.warn(`Preview failed (${ext}): ${err.message}`);
  }
  return { pages: null, png: null };
}

async function analysePdf(bytes) {
  const l = await loadLibs();
  if (!l) return { pages: null, png: null };
  const task = l.pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: standardFonts(),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages = doc.numPages;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = PREVIEW_W / base.width;
    const viewport = page.getViewport({ scale });
    const height = Math.min(Math.ceil(viewport.height), Math.ceil(PREVIEW_W * 1.6));
    const canvas = l.canvas.createCanvas(PREVIEW_W, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PREVIEW_W, height);
    await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
    return { pages, png: canvas.toBuffer('image/png') };
  } finally {
    await task.destroy();
  }
}

// ---------------------------------------------------------------- DOCX

/** Minimal ZIP reader: { name: Buffer } for the entries we ask for (stored or deflated). */
export function unzip(buf, wanted) {
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (wanted.includes(name)) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      out[name] = method === 0 ? data : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => decode([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));

/** Page 1 of a Word document as a list of layout blocks, up to the first page break. */
export function docxBlocks(documentXml) {
  const body = (documentXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, ''])[1];
  const blocks = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g;
  for (const m of body.matchAll(re)) {
    const xml = m[0];
    if (xml.startsWith('<w:tbl>')) {
      const rows = [...xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => textOf(c[0])));
      blocks.push({ type: 'table', rows });
      continue;
    }
    const style = (xml.match(/<w:pStyle w:val="([^"]+)"/) || [, ''])[1].toLowerCase();
    const text = textOf(xml);
    const list = /<w:numPr>/.test(xml) || /list/.test(style);
    const type = /^title$/.test(style) ? 'title' : /heading ?1|^h1$/.test(style) ? 'h1' : /heading|^h\d$/.test(style) ? 'h2' : list ? 'li' : 'p';
    const field = /<w:pBdr>/.test(xml);
    if (text || field) blocks.push({ type: field ? 'field' : type, text });
    else blocks.push({ type: 'gap' });
    if (/<w:br w:type="page"\/>|<w:pageBreakBefore\/>/.test(xml)) break;
  }
  return blocks;
}

export const docxPages = (appXml) => {
  const n = Number((String(appXml || '').match(/<Pages>(\d+)<\/Pages>/) || [])[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function analyseDocx(bytes) {
  const parts = unzip(bytes, ['word/document.xml', 'docProps/app.xml']);
  const pages = docxPages(parts['docProps/app.xml']?.toString('utf8'));
  const xml = parts['word/document.xml']?.toString('utf8');
  if (!xml) return { pages, png: null };
  const l = await loadLibs();
  if (!l) return { pages, png: null };
  return { pages, png: drawDocx(l.canvas, docxBlocks(xml)) };
}

/** Lay out the blocks on a US Letter page (612 x 792 pt) and draw them as bars. */
function drawDocx(canvasLib, blocks) {
  const s = PREVIEW_W / 612;
  const W = PREVIEW_W;
  const H = Math.round(792 * s);
  const canvas = canvasLib.createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const left = 72 * s;
  const width = W - 2 * left;
  const bottom = H - 60 * s;
  let y = 72 * s;
  const ink = '#1F2A2E';
  const grey = '#8A9194';
  const accent = '#3F6F86';
  const rule = '#D9D4CD';
  const bar = (x, yy, w, h, color) => {
    ctx.fillStyle = color;
    const r = Math.min(h / 2, 2);
    ctx.beginPath();
    ctx.roundRect(x, yy, Math.max(w, h), h, r);
    ctx.fill();
  };
  // Approximate wrapped lines for `text` at `size` pt in a column `w` px wide.
  const lines = (text, size, w) => {
    const perLine = Math.max(8, Math.floor(w / (size * s * 0.5)));
    const words = text.split(/\s+/).filter(Boolean);
    const out = [];
    let cur = 0;
    for (const word of words) {
      if (cur && cur + 1 + word.length > perLine) { out.push(cur); cur = word.length; } else cur += (cur ? 1 : 0) + word.length;
    }
    if (cur) out.push(cur);
    return out.map((n) => Math.min(1, n / perLine));
  };
  for (const b of blocks) {
    if (y > bottom) break;
    if (b.type === 'gap') { y += 8 * s; continue; }
    if (b.type === 'title' || b.type === 'h1' || b.type === 'h2') {
      const size = b.type === 'title' ? 24 : b.type === 'h1' ? 16 : 13;
      y += (b.type === 'title' ? 0 : 10) * s;
      for (const f of lines(b.text, size, width)) {
        bar(left, y, width * f, size * 0.62 * s, b.type === 'h2' ? accent : ink);
        y += size * 1.35 * s;
      }
      y += 4 * s;
      continue;
    }
    if (b.type === 'field') {
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, y + 0.5, width - 1, 18 * s);
      y += 26 * s;
      continue;
    }
    if (b.type === 'table') {
      const rows = b.rows.slice(0, 14);
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const rh = 20 * s;
      const th = Math.min(rows.length * rh, bottom - y);
      ctx.fillStyle = '#E8F1F5';
      ctx.fillRect(left, y, width, rh);
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, y + 0.5, width - 1, th - 1);
      for (let r = 1; r * rh < th; r++) { ctx.beginPath(); ctx.moveTo(left, y + r * rh + 0.5); ctx.lineTo(left + width, y + r * rh + 0.5); ctx.stroke(); }
      for (let c = 1; c < cols; c++) { const x = left + (width * c) / cols; ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + th); ctx.stroke(); }
      rows.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell || (r + 1) * rh > th) return;
        const cw = width / cols - 10 * s;
        bar(left + (width * c) / cols + 5 * s, y + r * rh + rh / 2 - 2.5 * s, cw * Math.min(1, cell.length / 22), 5 * s, r === 0 ? ink : grey);
      }));
      y += th + 12 * s;
      continue;
    }
    const indent = b.type === 'li' ? 16 * s : 0;
    const ls = lines(b.text, 10.5, width - indent);
    ls.forEach((f, i) => {
      if (y > bottom) return;
      if (b.type === 'li' && i === 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(left + 4 * s, y + 2.5 * s, 2.2 * s, 0, Math.PI * 2); ctx.fill(); }
      bar(left + indent, y, (width - indent) * f, 4.6 * s, grey);
      y += 14 * s;
    });
    y += 6 * s;
  }
  return canvas.toBuffer('image/png');
}
