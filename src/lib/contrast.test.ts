import { describe, expect, it } from 'vitest'
import { contrastRatio, formatRatio, hexToRgba, isHexColor, normalizeHex, parseHex } from './contrast'

describe('contrast helper', () => {
  it('Blue Deep on white is about 6.15:1', () => {
    expect(contrastRatio('#22688A', '#FFFFFF')).toBeCloseTo(6.15, 1)
    expect(formatRatio(contrastRatio('#22688A', '#FFFFFF'))).toBe('6.15')
  })

  it('Body on Media is about 4.31:1 (fails AA)', () => {
    const r = contrastRatio('#646B6D', '#ECE4DA')
    expect(r).toBeCloseTo(4.31, 1)
    expect(r).toBeLessThan(4.5)
  })

  it('is symmetric and bounded', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#3F474A', '#3F474A')).toBe(1)
  })

  it('parses and normalises hex', () => {
    expect(parseHex('#abc')).toEqual([170, 187, 204])
    expect(parseHex('22688A')).toEqual([34, 104, 138])
    expect(isHexColor('#12345')).toBe(false)
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(hexToRgba('#22688A', 0.55)).toBe('rgba(34, 104, 138, 0.55)')
  })
})
