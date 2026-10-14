// WCAG 2.x contrast helpers. Used by Admin settings to block brand colours under 4.5:1.

/** Parses #RGB or #RRGGBB (with or without #). Returns null when invalid. */
export function parseHex(input: string): [number, number, number] | null {
  const hex = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as [number, number, number]
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
  }
  return null
}

export function isHexColor(input: string): boolean {
  return parseHex(input) !== null
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) throw new Error(`Not a hex colour: ${hex}`)
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two hex colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Ratio rounded to 2 decimals, e.g. 6.15. */
export function formatRatio(ratio: number): string {
  return (Math.round(ratio * 100) / 100).toFixed(2)
}

export const AA_BODY = 4.5

/** "rgba(r, g, b, a)" from a hex colour. Used to derive --border-ghost from the brand colour. */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(34, 104, 138, ${alpha})`
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

/** Normalises to lowercase #rrggbb, or null. */
export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input)
  if (!rgb) return null
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
}
