// Product-level defaults, used before an organisation is known and as fallbacks.
// The product is Clinically Ready. Each practice still shows its own name and branding (e.g. The Well);
// these only appear before a practice is known (generic sign-in, browser tab) and in the generic version.
export const PRODUCT_NAME = 'Clinically Ready'
export const PRODUCT_TAGLINE = 'Every new clinician, ready for their first client.'
export const DEFAULT_BRAND = '#22688A'
/** The Clinically Ready mark for dark panels (light-blue circle, brand-blue smile). Brand guide: on-dark version. */
export const PRODUCT_MARK_ON_DARK = '/brand/mark-on-dark.svg'

// The Well's assets. Only used by The Well's seed data and as the lesson poster fallback.
const ASSETS = 'https://raw.githubusercontent.com/tommyclaffey/thewell-assets/main'
export const DEFAULT_POSTER = `${ASSETS}/real/angela-room-wide.jpg`
/** Neutral poster for every other practice (and the demo). */
export const NEUTRAL_POSTER = '/demo/poster.jpg'
/** The poster to show when a step has none: The Well's own photo for The Well, neutral for everyone else. */
export const posterFor = (practiceSlug: string | null | undefined) => (practiceSlug === 'the-well' ? DEFAULT_POSTER : NEUTRAL_POSTER)

/** Remembers the last organisation signed into, so /signin shows its branding next time. */
export const ORG_KEY = 'coa.org'
export const rememberOrg = (slug: string) => {
  try { localStorage.setItem(ORG_KEY, slug) } catch { /* private mode */ }
}
export const rememberedOrg = () => {
  try { return localStorage.getItem(ORG_KEY) } catch { return null }
}
