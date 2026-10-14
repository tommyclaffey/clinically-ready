// Link previews (iMessage, Slack, Facebook, LinkedIn…). Crawlers don't run JavaScript, so the server
// writes the Open Graph tags into index.html itself, per practice when the link names one (?org=slug).
import fs from 'node:fs';
import path from 'node:path';
import { termsOf } from './shapes.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The practice a URL is about: ?org=slug on any page. Unknown or missing -> null. */
export function practiceForUrl(db, url) {
  const slug = url.searchParams.get('org');
  if (!slug || !SLUG.test(slug)) return null;
  return db.prepare('SELECT * FROM practices WHERE slug = ?').get(slug) || null;
}

/** The <head> tags for one page. `imageFor(slug)` says whether a card image exists for that practice. */
export function shareTags({ practice, origin, url, imageFor }) {
  const terms = practice ? termsOf(practice) : termsOf({});
  // A welcome first, then plainly what it is: their onboarding (wording from the manual's own pitch).
  const ob = terms.onboarding;
  const obLower = ob ? ob[0].toLowerCase() + ob.slice(1) : 'onboarding';
  const title = practice ? `Welcome to ${practice.name} · ${ob}` : `Clinically Ready · ${ob}`;
  const description = `Your ${obLower}${practice ? ` at ${practice.name}` : ''}: short video lessons on the steps, checklists and language you'll need, so you start ready and supported.`;
  const slug = practice && imageFor(practice.slug) ? practice.slug : 'default';
  const image = `${origin}/og/${slug}.jpg`;
  const pageUrl = `${origin}${url.pathname}${url.search}`;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(practice ? practice.name : terms.portal)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
  ];
  return tags.join('\n    ');
}

/** index.html with the share tags in place of its plain <title>. */
export function renderIndex(html, tags) {
  return html.replace(/<title>[\s\S]*?<\/title>/, tags);
}

export const cardExists = (distDir) => (slug) => fs.existsSync(path.join(distDir, 'og', `${slug}.jpg`));
