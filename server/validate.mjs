// Small input validators. Each throws a 400 with a sentence the UI can show as-is.
import { fail } from './http.mjs';

/** Trimmed string, required unless `optional`, at most `max` chars. */
export function text(value, label, { max = 200, optional = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(400, `${label} must be text.`);
  const v = value.trim();
  if (!v && !optional) fail(400, `${label} is required.`);
  if (v.length > max) fail(400, `${label} must be ${max} characters or fewer.`);
  return v;
}

export function email(value) {
  const v = text(value, 'Email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'Enter a valid email address.');
  return v;
}

export function password(value, min) {
  if (typeof value !== 'string' || value.length < min) fail(400, `Password must be at least ${min} characters.`);
  if (value.length > 200) fail(400, 'Password must be 200 characters or fewer.');
  return value;
}

export function int(value, label, { min = 0, max = 1e9, optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} must be a whole number.`);
  return n;
}

export function oneOf(value, label, allowed) {
  if (!allowed.includes(value)) fail(400, `${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}

/** Empty, or an absolute http(s) URL. */
export function url(value, label, { allowLocalVideo = false } = {}) {
  const v = text(value, label, { max: 2000, optional: true });
  if (!v) return '';
  if (allowLocalVideo && /^\/api\/videos\/\d+$/.test(v)) return v; // an uploaded video
  if (allowLocalVideo && /^\/demo\/[\w-]+\.mp4$/.test(v)) return v; // the demo's sample video
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' || u.protocol === 'http:') return v;
  } catch {
    // fall through
  }
  fail(400, `${label} must be a full web address starting with https://.`);
}

export function stringList(value, label, { max = 20, maxLen = 500 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) fail(400, `${label} must be a list of up to ${max} items.`);
  return value.map((v) => text(v, label, { max: maxLen }));
}

/** Up to 10 {label, url} links (http/https only). Empty list clears them. */
export function links(value, label = 'Links') {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) fail(400, `${label} must be a list of up to 10 links.`);
  return value.map((l, i) => {
    if (!l || typeof l !== 'object') fail(400, `${label}: item ${i + 1} needs a name and a link.`);
    const u = url(l.url, `${label}: link ${i + 1}`);
    if (!u) fail(400, `${label}: link ${i + 1} is missing its web address.`);
    return { label: text(l.label, `${label}: name ${i + 1}`, { max: 80 }), url: u };
  });
}

const BLOCK_TYPES = new Set(['h', 'p', 'list', 'checklist', 'steps', 'quote', 'callout', 'dodont']);

/** A lesson's reading as plain-text blocks. No HTML: the front end renders each type itself. */
export function contentBlocks(value, label = 'Lesson content') {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 80) fail(400, `${label} must be a list of up to 80 blocks.`);
  const items = (list, where) => {
    if (!Array.isArray(list) || list.length > 30) fail(400, `${label}: ${where} must be a list of up to 30 items.`);
    return list.map((x) => text(x, `${label}: ${where} item`, { max: 600 }));
  };
  return value.map((b, i) => {
    const where = `block ${i + 1}`;
    if (!b || typeof b !== 'object' || !BLOCK_TYPES.has(b.type)) fail(400, `${label}: ${where} has an unknown type.`);
    if (b.type === 'dodont') return { type: 'dodont', do: items(b.do ?? [], `${where} "do"`), dont: items(b.dont ?? [], `${where} "don't"`) };
    if (['list', 'checklist', 'steps'].includes(b.type)) return { type: b.type, items: items(b.items, where) };
    return { type: b.type, text: text(b.text, `${label}: ${where}`, { max: b.type === 'h' ? 160 : 1200 }) };
  });
}
