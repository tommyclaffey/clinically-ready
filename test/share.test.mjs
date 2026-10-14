// Link previews: per-practice Open Graph tags, escaped, with a fallback card.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { practiceForUrl, renderIndex, shareTags } from '../server/share.mjs';

const practice = { slug: 'the-well', name: 'The Well', terms: JSON.stringify({ portal: 'Clinician portal', members: 'clinicians', onboarding: 'Clinical onboarding' }) };
const html = '<html><head><title>Clinician portal</title></head><body></body></html>';

test('a practice link gets its own title, description and card', () => {
  const url = new URL('https://app.test/signin?org=the-well');
  const tags = shareTags({ practice, origin: 'https://app.test', url, imageFor: () => true });
  const out = renderIndex(html, tags);
  assert.match(out, /<title>Welcome to The Well · Clinical onboarding<\/title>/);
  assert.match(out, /og:image" content="https:\/\/app\.test\/og\/the-well\.jpg"/);
  assert.match(out, /Your clinical onboarding at The Well: short video lessons/);
  assert.match(out, /twitter:card" content="summary_large_image"/);
  assert.equal((out.match(/<title>/g) || []).length, 1);
});

test('no card image for the practice -> the default card', () => {
  const url = new URL('https://app.test/signin?org=the-well');
  const tags = shareTags({ practice, origin: 'https://app.test', url, imageFor: () => false });
  assert.match(tags, /og\/default\.jpg/);
});

test('no practice -> generic tags', () => {
  const tags = shareTags({ practice: null, origin: 'https://app.test', url: new URL('https://app.test/'), imageFor: () => true });
  assert.match(tags, /<title>Clinically Ready · Onboarding<\/title>/);
  assert.match(tags, /og\/default\.jpg/);
});

test('names and URLs are HTML-escaped', () => {
  const evil = { slug: 'x', name: '"><script>alert(1)</script>', terms: '{}' };
  const url = new URL('https://app.test/signin?org=x&q="><b>');
  const tags = shareTags({ practice: evil, origin: 'https://app.test', url, imageFor: () => false });
  assert.doesNotMatch(tags, /<script>/);
  assert.doesNotMatch(tags, /"><b>/);
});

test('practiceForUrl ignores bad slugs and unknown practices', () => {
  const db = { prepare: () => ({ get: (s) => (s === 'the-well' ? practice : undefined) }) };
  assert.equal(practiceForUrl(db, new URL('https://a/?org=the-well')), practice);
  assert.equal(practiceForUrl(db, new URL('https://a/?org=nope')), null);
  assert.equal(practiceForUrl(db, new URL("https://a/?org=';drop")), null);
  assert.equal(practiceForUrl(db, new URL('https://a/')), null);
});
