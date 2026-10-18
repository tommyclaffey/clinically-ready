import type { PathWeek, Resource, Week } from '../api'

/** "Week 1 · Foundations" from title + subtitle (either may be empty). */
export function weekLabel(w: { title: string; subtitle?: string | null }): string {
  return [w.title, w.subtitle].filter((s) => s && s.trim()).join('  ·  ')
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

/** 432 -> "7:12" ; 3700 -> "1:01:40" */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** 120 -> "About 2 hours left" */
export function timeLeft(min: number): string {
  if (min <= 0) return 'All lessons complete'
  if (min < 60) return `About ${plural(min, 'minute')} left`
  const h = Math.round(min / 60)
  return `About ${plural(h, 'hour')} left`
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace('Sep ', 'Sept ')
}

export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_NAMES: Record<string, string> = {
  pdf: 'PDF', docx: 'Word', doc: 'Word', xlsx: 'Excel', pptx: 'PowerPoint',
  zip: 'ZIP', png: 'Image', jpg: 'Image', jpeg: 'Image', txt: 'Text', mp4: 'Video',
}

export const fileExt = (r: Resource) => (r.fileType || '').replace(/^\./, '').toLowerCase()
export const fileTypeName = (r: Resource) => TYPE_NAMES[fileExt(r)] ?? fileExt(r).toUpperCase()
export const pagesLabel = (r: Resource) => (r.pages ? `${r.pages} ${r.pages === 1 ? 'page' : 'pages'}` : '')
/** "PDF  ·  42 pages  ·  3.6 MB" */
export const fileMeta = (r: Resource) => [fileTypeName(r), pagesLabel(r), r.sizeLabel].filter(Boolean).join('  ·  ')
/** "Updated Sep 2026" from updatedAt, or '' when there's no date. */
export function updatedLabel(r: Resource): string {
  const d = r.updatedAt ? new Date(r.updatedAt) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `Updated ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}
/** Which illustration a file gets when it has no preview. */
export function previewKind(r: Resource): 'doc' | 'form' | 'sheet' | 'slides' | 'image' | 'video' | 'archive' {
  const e = fileExt(r)
  if (e === 'docx' || e === 'doc') return 'form'
  if (e === 'xlsx' || e === 'csv') return 'sheet'
  if (e === 'pptx') return 'slides'
  if (e === 'png' || e === 'jpg' || e === 'jpeg') return 'image'
  if (e === 'mp4') return 'video'
  if (e === 'zip') return 'archive'
  return 'doc'
}

/** Tile colour per design: PDF = Blue Deep, Word = Slate, ZIP and others = Body. */
export function tileClass(r: Resource): string {
  const e = fileExt(r)
  if (e === 'pdf') return 'tile--deep'
  if (e === 'docx' || e === 'doc' || e === 'xlsx' || e === 'pptx') return 'tile--slate'
  return 'tile--body'
}

export function firstName(name: string | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1 && /^(dr|mr|mrs|ms|rev|pastor)\.?$/i.test(parts[0])) return parts[1]
  return parts[0]
}

/** Flattens weeks into lesson-number lookup (global 1-based index). */
export function lessonNumbers(weeks: Array<Week | PathWeek>): Map<number, number> {
  const m = new Map<number, number>()
  let i = 0
  for (const w of weeks) for (const l of w.lessons) m.set(l.id, ++i)
  return m
}

export type VideoKind =
  | { kind: 'none' }
  | { kind: 'file'; src: string }
  | { kind: 'embed'; src: string; provider: 'youtube' | 'vimeo' | 'loom' }

/** Classifies a lesson video URL: .mp4 file, YouTube/Vimeo embed, or nothing. */
export function videoSource(url: string | null | undefined): VideoKind {
  const u = (url ?? '').trim()
  if (!u) return { kind: 'none' }
  if (/\.(mp4|m4v|webm|mov)(\?|#|$)/i.test(u)) return { kind: 'file', src: u }
  if (/^\/api\/videos\/\d+$/.test(u)) return { kind: 'file', src: u } // uploaded to the app
  let parsed: URL
  try {
    parsed = new URL(u, 'https://placeholder.invalid')
  } catch {
    return { kind: 'none' }
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0]
    if (id) return { kind: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = parsed.searchParams.get('v') ?? parsed.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]
    if (id) return { kind: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parsed.pathname.match(/(\d{5,})/)?.[1]
    if (id) {
      const h = parsed.searchParams.get('h')
      return { kind: 'embed', provider: 'vimeo', src: `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ''}` }
    }
  }
  if (host === 'loom.com') {
    const id = parsed.pathname.match(/\/(?:share|embed)\/([0-9a-f]{20,})/i)?.[1]
    if (id) return { kind: 'embed', provider: 'loom', src: `https://www.loom.com/embed/${id}` }
  }
  return { kind: 'none' }
}

/** Which service a video link points at, for labels ("YouTube video"). */
export function videoLabel(url: string): string {
  const s = videoSource(url)
  if (s.kind === 'file') return /^\/api\/videos\//.test(url) ? 'Uploaded video' : 'Video file'
  if (s.kind === 'embed') return { youtube: 'YouTube video', vimeo: 'Vimeo video', loom: 'Loom video' }[s.provider] ?? 'Video'
  return ''
}
