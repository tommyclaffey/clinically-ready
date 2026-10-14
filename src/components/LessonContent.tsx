// A lesson's reading ("From the manual"), rendered from plain-text blocks. Never renders HTML.
import { useState } from 'react'
import type { ContentBlock } from '../api'
import { CheckIcon, CloseIcon } from './Icons'
import { Disclosure } from './ui'

type Section = { title: string; blocks: ContentBlock[] }

/** Splits the reading at each heading. Blocks before the first heading are the intro. */
function sectionsOf(blocks: ContentBlock[]): { intro: ContentBlock[]; sections: Section[] } {
  const intro: ContentBlock[] = []
  const sections: Section[] = []
  for (const b of blocks) {
    if (b.type === 'h') sections.push({ title: b.text, blocks: [] })
    else if (sections.length) sections[sections.length - 1]!.blocks.push(b)
    else intro.push(b)
  }
  return { intro, sections }
}

const countItems = (blocks: ContentBlock[]) =>
  blocks.reduce((n, b) => n + ('items' in b ? b.items.length : b.type === 'dodont' ? b.do.length + b.dont.length : 0), 0)

/**
 * The reading, one collapsible section per heading so a long page reads like a table of contents.
 * The first section starts open; short readings (0–1 headings) show flat.
 */
export function LessonContent({ blocks }: { blocks?: ContentBlock[] }) {
  const { intro, sections } = sectionsOf(blocks ?? [])
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]))
  if (!blocks?.length) return null
  if (sections.length < 2) return <ReadingBlocks blocks={blocks} />
  const allOpen = open.size === sections.length
  return (
    <div className="reading reading--sections">
      {intro.length > 0 && <ReadingBlocks blocks={intro} />}
      <div className="reading__toolbar">
        <p className="meta">{sections.length} sections</p>
        <button type="button" className="btn-ghost-text text-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((_, i) => i)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {sections.map((sec, i) => {
        const n = countItems(sec.blocks)
        return (
          <Disclosure
            key={i}
            title={sec.title}
            meta={n ? `${n} items` : undefined}
            open={open.has(i)}
            onToggle={(o) => setOpen((prev) => { const next = new Set(prev); if (o) next.add(i); else next.delete(i); return next })}
          >
            <ReadingBlocks blocks={sec.blocks} />
          </Disclosure>
        )
      })}
    </div>
  )
}

/** Reading blocks, flat (no collapsible sections). Also used by the admin editor's previews. */
export function ReadingBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="reading">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return <h3 key={i} className="reading__h">{b.text}</h3>
          case 'p':
            return <p key={i} className="body-md">{b.text}</p>
          case 'list':
            return <ul key={i} className="reading__list">{b.items.map((x, j) => <li key={j} className="body-md">{x}</li>)}</ul>
          case 'checklist':
            return (
              <ul key={i} className="reading__check">
                {b.items.map((x, j) => (
                  <li key={j}><span className="reading__box" aria-hidden="true" /><span className="body-md">{x}</span></li>
                ))}
              </ul>
            )
          case 'steps':
            return <ol key={i} className="reading__steps">{b.items.map((x, j) => <li key={j}><span className="reading__n" aria-hidden="true">{j + 1}</span><span className="body-sm-dark">{x}</span></li>)}</ol>
          case 'quote':
            return <blockquote key={i} className="reading__quote"><p>{b.text}</p></blockquote>
          case 'callout':
            return <p key={i} className="reading__callout body-sm-dark">{b.text}</p>
          case 'dodont':
            return (
              <div key={i} className="reading__dodont">
                <div>
                  <p className="label-muted">DO</p>
                  <ul>{b.do.map((x, j) => <li key={j}><CheckIcon size={14} className="icon-deep" /><span className="body-sm-dark">{x}</span></li>)}</ul>
                </div>
                <div>
                  <p className="label-muted">DO NOT</p>
                  <ul>{b.dont.map((x, j) => <li key={j}><CloseIcon size={14} /><span className="body-sm-dark">{x}</span></li>)}</ul>
                </div>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
