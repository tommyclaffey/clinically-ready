// Row -> API shape converters. The only place DB rows become JSON, so secrets can't leak.
import { pageBlocksOf } from './pageblocks.mjs';

const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'rev', 'prof']);

/** "Dr. Angela Claffey" -> "AC", "Jordan Lee" -> "JL", "Office manager" -> "OM". */
export function initials(name = '') {
  const words = String(name)
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.replace(/\.$/, '').toLowerCase()));
  if (!words.length) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** 86016 -> "84 KB", 2516582 -> "2.4 MB". */
export function sizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export const meShape = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  title: u.title || '',
  role: u.role,
  initials: initials(u.name),
});

/** Words each organisation picks. Defaults suit any company; The Well's seed uses therapy terms. */
export const DEFAULT_TERMS = Object.freeze({
  portal: 'Team portal',
  member: 'team member',
  members: 'team members',
  lead: 'manager',
  org: 'company',
  checklist: 'Before your first day',
  onboarding: 'Onboarding',
});
export const TERM_KEYS = Object.keys(DEFAULT_TERMS);

export function termsOf(p) {
  let saved = {};
  try { saved = JSON.parse(p.terms || '{}') || {}; } catch { saved = {}; }
  const out = { ...DEFAULT_TERMS };
  for (const k of TERM_KEYS) if (typeof saved[k] === 'string' && saved[k].trim()) out[k] = saved[k].trim();
  return out;
}

export const practiceShape = (p) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  isDemo: Boolean(p.is_demo),
  brandColor: p.brand_color || '#22688A',
  logoUrl: p.logo_url || '',
  terms: termsOf(p),
  welcome: welcomeOf(p),
  signIn: signInOf(p),
  clientMessaging: clientMessagingOf(p),
  paperworkEnabled: Boolean(p.paperwork_enabled),
});

/** Which sign-in methods an organisation allows. Defaults: all three. */
export function signInOf(p) {
  let saved = {};
  try { saved = JSON.parse(p.signin_methods || '{}') || {}; } catch { saved = {}; }
  const pick = (k) => (typeof saved[k] === 'boolean' ? saved[k] : true);
  return { password: pick('password'), google: pick('google'), microsoft: pick('microsoft') };
}

/** Where questions about clients go instead (e.g. SimplePractice). Null when not set. */
export function clientMessagingOf(p) {
  try {
    const c = JSON.parse(p.client_messaging || 'null');
    return c && c.label && c.url ? { label: String(c.label), url: String(c.url) } : null;
  } catch {
    return null;
  }
}

export const welcomeOf = (p) => ({
  quote: p.welcome_quote || '',
  ref: p.welcome_quote_ref || '',
  photoUrl: p.welcome_photo_url || '',
});

/** What an unauthenticated sign-in or invite page may show about an organisation. Nothing private. */
export const publicOrgShape = (p) => ({
  name: p.name,
  slug: p.slug,
  brandColor: p.brand_color || '#22688A',
  logoUrl: p.logo_url || '',
  terms: termsOf(p),
  welcome: welcomeOf(p),
  signIn: signInOf(p),
});

export const personShape = (u) => ({
  id: u.id,
  name: u.name,
  title: u.title || '',
  initials: initials(u.name),
});

export const resourceShape = (r) => ({
  id: r.id,
  title: r.title,
  fileType: r.file_type,
  sizeLabel: sizeLabel(r.size_bytes),
  category: r.category,
  lessonId: r.lesson_id ?? null,
});

/** `row` is a lessons row joined with the user's progress (status) and counts. */
export const lessonCard = (row) => ({
  id: row.id,
  title: row.title,
  durationMin: row.duration_min ?? 0,
  label: row.label || '',
  status: row.status || 'not_started',
  posterUrl: row.poster_url || '',
  hasVideo: Boolean(row.video_url),
  // The page has a video block (recorded or not). False = a step with no video at all.
  videoPlanned: row.blocks == null || /"type":"video"/.test(row.blocks),
  // Extra (additive) fields so the path rows can show "2 downloads · Quiz".
  resourceCount: row.resource_count ?? 0,
  hasQuiz: Boolean(row.quiz_count),
});

export function parseList(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Full lesson fields (no quiz answers). */
export const lessonShape = (l) => ({
  id: l.id,
  weekId: l.week_id,
  position: l.position,
  title: l.title,
  label: l.label || '',
  presenter: l.presenter || '',
  durationMin: l.duration_min ?? 0,
  videoUrl: l.video_url || '',
  posterUrl: l.poster_url || '',
  overview: l.overview || '',
  takeaways: parseList(l.takeaways),
  transcript: l.transcript || '',
  links: linksOf(l.links),
  content: blocksOf(l.content),
  blocks: pageBlocksOf(l),
  updatedAt: l.updated_at,
});

/** Stored lesson content blocks (validated on write). */
export function blocksOf(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Stored [{label, url}] links, tolerant of empty or bad JSON. */
export function linksOf(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((l) => l && l.label && l.url).map((l) => ({ label: String(l.label), url: String(l.url) })) : [];
  } catch {
    return [];
  }
}

export const weekShape = (w) => ({ id: w.id, title: w.title, subtitle: w.subtitle || '', position: w.position, links: linksOf(w.links) });
